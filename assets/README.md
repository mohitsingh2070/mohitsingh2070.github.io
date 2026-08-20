# Quiet Notes — GitHub Pages + Supabase

A lightweight personal writing archive for poems, anecdotes, notes, and fragments.

## What you get

- GitHub Pages + Jekyll
- Automatic archive from `_posts/`
- Beautiful responsive journal layout
- One Markdown file per entry
- Private response box at the bottom of every entry
- Supabase database stores responses
- Private admin page protected by Supabase email magic-link authentication
- Public visitors cannot read the response database
- No service-role key is ever placed in the website

## 1. Create the GitHub repository

Create a repository and upload this project.

The important folders are:

```text
_posts/
_layouts/
assets/
_config.yml
index.md
archive.md
about.md
admin.html
```

For GitHub Pages, enable Pages from the repository's main branch.

## 2. Create Supabase project

Create a project at https://supabase.com/

Then open SQL Editor and paste the contents of `supabase.sql`.

Before running it, replace:

```text
YOUR_ADMIN_EMAIL
```

with the email address you will use for your private dashboard.

## 3. Get the browser credentials

In Supabase, find your project's URL and publishable key.

Put them into BOTH:

```text
assets/js/comments.js
assets/js/admin.js
```

Replace:

```text
YOUR_SUPABASE_PROJECT_URL
YOUR_SUPABASE_PUBLISHABLE_KEY
```

Use the publishable/anon browser key only. NEVER put a `service_role` or secret key in GitHub.

## 4. Configure Auth

In Supabase Auth settings, make sure email/passwordless sign-in is enabled.

For the admin page, add your GitHub Pages URL to the allowed redirect URLs if Supabase asks for it.

Then visit:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/admin.html
```

Enter your admin email and use the magic link sent to you.

## 5. Add a new post

Create a file such as:

```text
_posts/2026-08-23-a-small-story.md
```

Use:

```yaml
---
layout: post
title: "A Small Story"
category: "anecdote"
subtitle: "Something I remembered."
---

Your writing goes here.

A second paragraph goes here.

> A short line or poem can be formatted like this.
```

Commit and push. GitHub Pages rebuilds the site and the archive automatically includes the new entry.

## Suggested categories

- poem
- anecdote
- note
- letter
- fragment
- photograph
- observation

## Important privacy note

The website itself is public unless you add authentication to the entire site.

The response messages are different: the SQL policies allow anonymous visitors to INSERT responses but do not allow anonymous SELECT. Only the configured admin email can read them.

Do not put secrets or sensitive personal information into the public repository.

## Recommended workflow

Write locally → create one Markdown file → commit/push → done.

You should not need to edit HTML for normal posting.
