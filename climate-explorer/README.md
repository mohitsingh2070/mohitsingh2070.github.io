# Climate Data Explorer

A browser tool for exploring gridded climate data (CMIP models, ERA5 and other reanalyses,
satellite products) in workshops. Open a NetCDF file and you can view it as a map with
coastlines, average it, compare it against a baseline, find trends, and click anywhere to get a time series.

Everything runs in the browser. Files are read on the user's own computer and are never uploaded,
so the tool can be hosted on any static web host, including GitHub Pages.

## Features

- **Opens** NetCDF-3 and NetCDF-4/HDF5 files (`.nc`), and CSV time series. Users can drag and drop a file or choose one of the bundled samples.
- **Reads CF conventions:** `scale_factor`/`add_offset`, `_FillValue`/`missing_value`, time units like
  `days since …` with the `standard`, `noleap`, `360_day` and `all_leap` calendars. It also handles ascending or descending latitude,
  longitudes in 0…360 or −180…180, pressure levels and extra dimensions such as ensemble members.
- **Converts units:** K → °C, kg m⁻² s⁻¹ → mm/day, Pa → hPa, ERA5 metres → mm, geopotential → height.
- **Has four map views:** one month (with ▶ animation), an average over chosen months and years (climatology),
  a linear trend per decade, and year-to-year variability (standard deviation). Each view can also be shown as an **anomaly** against a
  baseline period (default 1991–2020).
- **Offers map options:** Robinson, rectangular, Mollweide, a globe you can spin, and north/south polar views. There are region presets
  (South Asia, Tropical Pacific, …) and you can drag a box to zoom. Coastlines, country borders, a lat/lon grid and contour lines can be switched on,
  and there are perceptually even colour scales with smooth or stepped shading.
- **Draws time series** at a clicked point or averaged over a region (global, hemispheres, Niño 3.4, IOD, India box,
  current map area), as a line, ± bars or climate stripes, with a running mean and a trend line.
- **Plots the zonal mean** of the current map.
- **Shows file contents** in the same form as `ncdump -h`, so students can see what is inside the file.
- **Exports** the map as a PNG (with title and colour bar), the map data as CSV, and charts as PNG/CSV. A Print button prints
  just the figures.
- **Includes a Guide tab** that explains the ideas (reanalysis vs CMIP, climatology, anomaly, baseline) and suggests things to try.

## Putting it on your GitHub website

Copy the whole `climate-explorer/` folder into your site's repository, commit and push:

```
your-site-repo/
└── climate-explorer/
    ├── index.html
    ├── css/  js/  lib/
    └── data/        ← sample datasets (~70 MB, optional)
```

It is then live at `https://<username>.github.io/climate-explorer/`, or under your custom domain.
All paths are relative, so the folder name can be anything. There is no build step and nothing to install.

- Every file is under 25 MB, so it can also be uploaded through GitHub's web page (“Add file → Upload files”). If you want a smaller repo, delete
  some of them and remove their lines from `SAMPLES` at the top of `js/app.js`.
- If your site uses Jekyll (most themes do), the folder is copied through unchanged.
- Workshop links can open a dataset directly: `…/climate-explorer/?sample=2` opens the SST sample (0 = air temperature,
  1 = precipitation, 2 = SST, 3 = sea-level pressure, 4 = Niño 3.4 CSV), and `?file=data/yourfile.nc` opens any file in the folder.

## Running it locally

Double-clicking `index.html` works for files you upload yourself. The sample-dataset menu only works through a web server, because browsers block `file://` pages from fetching other files:

```bash
cd climate-explorer
python3 -m http.server 8000
# open http://localhost:8000
```

## Sample data (in `data/`)

| File | Contents | Source |
|---|---|---|
| `air.mon.mean.nc` | Near-surface (σ=0.995) air temperature, monthly, 1948– (packed to 0.01 °C) | NCEP/NCAR Reanalysis 1, NOAA PSL |
| `precip.mon.mean.nc` | Precipitation, monthly, 1979– | GPCP v2.3, NOAA PSL |
| `ersst_v5_sst_1950-present.nc` | Sea surface temperature, monthly, 1950– (subset, packed to 0.01 °C) | NOAA ERSST v5, NOAA PSL |
| `slp.mon.mean.nc` | Sea-level pressure, monthly, 1948– | NCEP/NCAR Reanalysis 1, NOAA PSL |
| `nino34_index_ersstv5.csv` | Niño 3.4 SST and anomaly (vs 1991–2020), computed from ERSST v5 | derived |

To refresh them with the latest months, download the files again from
<https://psl.noaa.gov/data/gridded/>.

## Limits

- The whole file is loaded into browser memory, so keep files below about 1 GB. Cut big ones down with CDO, for example
  `cdo sellonlatbox,60,100,0,40 -selyear,1980/2020 in.nc out.nc`. The Guide tab lists more commands.
- Only regular lat/lon grids can be mapped (this covers most CMIP atmosphere output and ERA5). Ocean-model curvilinear grids
  need regridding first: `cdo remapbil,r360x180 in.nc out.nc`.
- GRIB, Zarr and OPeNDAP URLs are not read. Convert GRIB with `cdo -f nc copy in.grib out.nc`.

## Code layout

| File | Purpose |
|---|---|
| `js/ncreader.js` | NetCDF-3 parser plus NetCDF-4 reading via h5wasm. Both give one common interface |
| `js/cftime.js` | CF time decoding with the various calendars |
| `js/map.js` | Map rendering (projections, raster, contours, coastlines, colour bar, mouse) |
| `js/charts.js` | Time-series and zonal-mean charts (d3) |
| `js/colormaps.js` | Colour scales |
| `js/app.js` | User interface, variable detection, averaging, anomalies, trends, export |
| `lib/` | Bundled third-party code: d3, d3-geo-projection, topojson-client, h5wasm |
| `lib/world-data.js` | Coastlines (Natural Earth via world-atlas) and country borders from Natural Earth's India point-of-view edition (`ne_10m_admin_0_countries_ind`), so all of Jammu & Kashmir, Ladakh and Arunachal Pradesh are shown within India |

Third-party libraries are under their own licences (d3 and topojson: ISC; h5wasm: see its repository).
Coastline and border data come from Natural Earth (public domain).
