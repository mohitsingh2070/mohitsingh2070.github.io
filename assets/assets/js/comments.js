/*
  Supabase configuration.
  Replace the two placeholders with your project's URL and PUBLISHABLE key.
  Never put a service_role/secret key in this file.
*/

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

const form = document.getElementById("response-form");
const statusEl = document.getElementById("response-status");
const postBox = document.querySelector(".response-box");

if (form && postBox && SUPABASE_URL.startsWith("http")) {
  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("response-name").value.trim();
    const message = document.getElementById("response-message").value.trim();
    const postSlug = postBox.dataset.postSlug;

    if (!message) return;

    statusEl.textContent = "Saving…";
    const button = form.querySelector("button");
    button.disabled = true;

    const { error } = await client.from("responses").insert({
      post_slug: postSlug,
      name: name || null,
      message: message
    });

    if (error) {
      console.error(error);
      statusEl.textContent = "Something went wrong. Please try again.";
      button.disabled = false;
      return;
    }

    form.reset();
    statusEl.textContent = "Left here. Thank you.";
    button.disabled = false;
  });
}
