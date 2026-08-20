---
layout: default
title: Home
---

<section class="hero">
  <p class="eyebrow">A small corner of the internet</p>
  <h1>Things I wanted to keep.</h1>
  <p class="lede">
    Anecdotes, poems, fragments, observations, and the occasional thought
    that felt worth writing down.
  </p>
  <a class="button" href="{{ '/archive/' | relative_url }}">Browse the archive</a>
</section>

{% assign latest = site.posts | first %}
{% if latest %}
<section class="latest">
  <div class="section-label">Latest</div>
  <article class="card featured">
    <time datetime="{{ latest.date | date_to_xmlschema }}">{{ latest.date | date: "%d %B %Y" }}</time>
    <h2><a href="{{ latest.url | relative_url }}">{{ latest.title }}</a></h2>
    {% if latest.excerpt %}
      <div class="excerpt">{{ latest.excerpt }}</div>
    {% endif %}
    <a class="text-link" href="{{ latest.url | relative_url }}">Read →</a>
  </article>
</section>
{% endif %}

<section class="welcome">
  <div>
    <div class="section-label">If you are visiting</div>
    <h2>Stay as long as you like.</h2>
    <p>
      There is no schedule here and nothing you need to respond to.
      Read something, skip something, come back another day.
    </p>
  </div>
</section>
