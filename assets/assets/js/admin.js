const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const login = document.getElementById("login");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const responsesEl = document.getElementById("responses");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginStatus.textContent = "Sending sign-in link…";
  const email = document.getElementById("email").value.trim();

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  });

  loginStatus.textContent = error
    ? error.message
    : "Check your email for the sign-in link.";
});

async function loadResponses() {
  const { data, error } = await client
    .from("responses")
    .select("id, post_slug, name, message, created_at, status")
    .order("created_at", { ascending: false });

  if (error) {
    responsesEl.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    responsesEl.innerHTML = "<p>No responses yet.</p>";
    return;
  }

  responsesEl.innerHTML = data.map(item => `
    <article class="card" style="margin-bottom:18px">
      <div class="post-meta">
        <span>${new Date(item.created_at).toLocaleString()}</span>
        <span>·</span>
        <span>${escapeHtml(item.post_slug)}</span>
        <span>·</span>
        <span>${escapeHtml(item.status)}</span>
      </div>
      <h2>${escapeHtml(item.name || "Anonymous")}</h2>
      <p style="white-space:pre-wrap">${escapeHtml(item.message)}</p>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

client.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    login.hidden = true;
    dashboard.hidden = false;
    await loadResponses();
  }
});
