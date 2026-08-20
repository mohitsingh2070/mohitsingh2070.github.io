---
layout: default
title: Archive
permalink: /archive/
---

<header class="page-header">
  <p class="eyebrow">Everything, in order</p>
  <h1>Archive</h1>
  <p>Stories, poems, notes, and unfinished thoughts.</p>
</header>

<div class="archive-list">
{% assign posts = site.posts %}
{% for post in posts %}
  <article class="archive-item">
    <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d %b %Y" }}</time>
    <div>
      <h2><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
      {% if post.category %}<span class="tag">{{ post.category }}</span>{% endif %}
      {% if post.excerpt %}<p>{{ post.excerpt | strip_html | truncate: 180 }}</p>{% endif %}
    </div>
  </article>
{% else %}
  <p>No entries yet. Add your first file to <code>_posts/</code>.</p>
{% endfor %}
</div>
