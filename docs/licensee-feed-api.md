# Licensee Feed API, version 1

This document describes the machine feed a licensee uses to receive local editions. It covers authentication, the three endpoints, every field they return, when content is available, languages, limits and versioning.

## Overview

An edition is one place: a neighbourhood, town or district with its own name, country and timezone. Each morning an edition publishes two things:

- **The Daily Brief**: a set of short local stories, each under its own header, with the publications the facts came from.
- **The Look Ahead**: the coming days' events in that place, as a list of dated events and a short written guide.

The feed delivers both in two shapes:

- **By edition and date** (`/editions/{id}/daily`): the finished edition for one place and one local date, ready to lay out as a newsletter or a page.
- **Story by story** (`/stories`): a flat list of individual stories across all your editions, newest first, each carrying its place and its sources, for a CMS or a wire-style import.

Base URL:

```
https://readflaneur.com/api/v1
```

All responses are JSON in UTF-8. All times are ISO 8601 in UTC unless a field says otherwise; all dates (`YYYY-MM-DD`) are local to the edition.

## Authentication

Every request carries your key in the `Authorization` header:

```
Authorization: Bearer 3f9c0a1b2d4e5f60718293a4
```

A key is 24 hexadecimal characters and belongs to one licensee. It gives read access to the editions agreed for that licensee and nothing else. Keep it on your server; do not put it in a browser or an app.

| Situation | Status |
|---|---|
| No key, or a key we do not recognise | `401` |
| An edition your key is not licensed for | `404` (the same answer as an edition that does not exist) |

To rotate a key, ask us. All keys are rotated together if we ever need to rotate the underlying secret, and we will tell you in advance.

## Endpoints

### 1. List your editions

```
GET /api/v1/editions
```

Returns every edition your key may read.

```bash
curl -H "Authorization: Bearer $KEY" https://readflaneur.com/api/v1/editions
```

```json
{
  "version": "v1",
  "editions": [
    {
      "id": "berlin-prenzlauer-berg",
      "name": "Prenzlauer Berg",
      "city": "Berlin",
      "region": null,
      "country": "Germany",
      "timezone": "Europe/Berlin",
      "language": "en",
      "languages": ["en", "de", "fr", "es", "it", "pt", "sv", "zh", "ja", "nb"]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Stable edition id. Use it in the other two endpoints. |
| `name` | The place's name as it appears in the edition. |
| `city` | The city, county or province the place belongs to. |
| `region` | A wider region where one is recorded (for example a province for a small town), otherwise `null`. |
| `country` | Country name. |
| `timezone` | IANA timezone. Every local date in the feed is a date in this timezone. |
| `language` | The language the edition is written in. |
| `languages` | Languages you can request with `lang` (see Languages). |

### 2. The daily edition for one place

```
GET /api/v1/editions/{id}/daily?date=YYYY-MM-DD&lang=xx
```

| Parameter | Required | Meaning |
|---|---|---|
| `id` | yes | Edition id from `/editions`. |
| `date` | no | Local date in the edition's timezone. Defaults to today there. A date after today returns `400`. |
| `lang` | no | Language to return (see Languages). Defaults to the language agreed for your key, otherwise English. |

```bash
curl -H "Authorization: Bearer $KEY" \
  "https://readflaneur.com/api/v1/editions/berlin-prenzlauer-berg/daily?date=2026-09-23"
```

Response (trimmed; a real Daily Brief usually has several stories and a Look Ahead often lists a dozen or more events):

```json
{
  "version": "v1",
  "edition": {
    "id": "berlin-prenzlauer-berg",
    "name": "Prenzlauer Berg",
    "city": "Berlin",
    "region": null,
    "country": "Germany",
    "timezone": "Europe/Berlin",
    "language": "en"
  },
  "date": "2026-09-23",
  "language": "en",
  "requested_language": "en",
  "daily_brief": {
    "article_id": "ff4a9df4-a119-4585-954d-ab5588b4834c",
    "headline": "The Great Correction",
    "subject_teaser": "the great correction",
    "published_at": "2026-09-22T22:02:03.445+00:00",
    "greeting": "Guten Morgen, Prenzlauer Berg.",
    "sign_off": "Schönen Tag.",
    "body_markdown": "Guten Morgen, Prenzlauer Berg.\n\n## The Final Note\nFor anyone who has been enjoying the city's concert halls, take note: ...",
    "stories": [
      {
        "id": "54b15b79d5ca9302d05d18c8",
        "position": 0,
        "header": "The Final Note",
        "text": "For anyone who has been enjoying the city's concert halls, take note: [Musikfest Berlin 2026](https://www.google.com/search?q=...) comes to a close today, Wednesday, September 23. ...",
        "sources": [
          { "name": "visitBerlin.de", "url": "https://www.visitberlin.de/en/event/musikfest-berlin-2026" }
        ],
        "place": {
          "edition_id": "berlin-prenzlauer-berg",
          "name": "Prenzlauer Berg",
          "city": "Berlin",
          "country": "Germany"
        }
      }
    ],
    "sources": [
      { "name": "visitBerlin.de", "url": "https://www.visitberlin.de/en/event/musikfest-berlin-2026" },
      { "name": "Festivals in Deutschland", "url": "https://www.festivals-in-deutschland.de/prenzlauerberginale-berlin/" }
    ]
  },
  "look_ahead": {
    "article_id": "35db3806-a87d-4980-bb25-07e100ef1d2d",
    "headline": "Film Festival Finale",
    "published_at": "2026-09-23T05:00:00+00:00",
    "body_markdown": "## Today, Wednesday September 23\n\nThe Prenzlauerberginale #10, a film festival dedicated to ...",
    "events": [
      {
        "date": "2026-09-25",
        "day_label": "Friday",
        "time": "10:00",
        "name": "SOAR X BERLIN '26",
        "category": "Running Event",
        "location": "Rapha Berlin Clubhouse",
        "address": null,
        "price": null,
        "also_on": null
      }
    ],
    "sources": []
  },
  "audio": null
}
```

**Top level**

| Field | Meaning |
|---|---|
| `date` | The local date this edition is for. |
| `language` | The language the content is actually in. |
| `requested_language` | The language you asked for. If it differs from `language`, a translation failed and you received the original (see Languages). |
| `daily_brief` | The Daily Brief, or `null` if none has been published for this date yet. |
| `look_ahead` | The Look Ahead, or `null` if none has been published for this date yet. |
| `audio` | The spoken edition for this date, or `null` (see `audio` below). |

**`daily_brief`**

| Field | Meaning |
|---|---|
| `article_id` | Stable id of the published Daily Brief. |
| `headline` | The edition's headline for the day, without any section label. |
| `subject_teaser` | A short lower-case line written for an email subject line. In a translated response it is the translated headline. |
| `published_at` | When the Daily Brief was published. |
| `greeting` | The opening line ("Good morning, ..."), or `null`. |
| `sign_off` | The closing line, or `null`. |
| `body_markdown` | The whole Daily Brief as Markdown: greeting, each story under a `##` header, sign-off. |
| `stories` | The same content as a list, one entry per story (below). |
| `sources` | Every publication the Daily Brief drew on, deduplicated. |

**`stories[]`** (the same shape as items in `/stories`, less the three fields that endpoint adds)

| Field | Meaning |
|---|---|
| `id` | Stable story id. The same story has the same id in every language and in both endpoints, so you can deduplicate on it. |
| `position` | Order within the Daily Brief, from 0. |
| `header` | The story's header. |
| `text` | The story as Markdown. Links inside the text are reading aids, many of them search links; the publications a story is based on are in `sources`. |
| `sources` | The publications, sites or accounts the story's facts came from: `name` and `url` (`url` is `null` where we have a name but no durable link). A story can have no sources, for example where no checkable publication was found; generic labels that name no publication ("Local News", "Various sources" and the like) are removed rather than shown. |
| `place` | The edition the story belongs to: `edition_id`, `name`, `city`, `country`. |

**`look_ahead`**

| Field | Meaning |
|---|---|
| `article_id` | Stable id of the published Look Ahead. |
| `headline` | Headline without the section label. |
| `published_at` | Release time: 07:00 local on `date`. |
| `body_markdown` | The written guide to the coming days as Markdown, one `##` header per day. |
| `events` | The event listing (below), in date order. |
| `sources` | Publications the Look Ahead drew on, where recorded. |

**`events[]`**

| Field | Meaning |
|---|---|
| `date` | Local date of the event, `YYYY-MM-DD`. |
| `day_label` | Weekday name in English, for example `Friday`. |
| `time` | Start time or range as written, for example `19:30` or `12:00-15:00`, or `null`. |
| `name` | Event name. |
| `category` | For example `Concert`, `Exhibition`, `Market`, or `null`. |
| `location` | Venue name, or `null`. |
| `address` | Street address, or `null`. Postcode and city are usually omitted. |
| `price` | Price as written, for example `Free` or `EUR 25`, or `null`. |
| `also_on` | For an event that repeats in the period, the other days as short weekday names (for example `Sat, Sun`), otherwise `null`. The event is listed once, on its first day. |

Event fields are kept in their original language when you request a translation, because names, venues and addresses are proper nouns. The written guide in `body_markdown` is translated.

**`audio`**

A spoken version of the morning's edition, 60 to 90 seconds: the place and date, the Daily Brief stories, two or three upcoming events from the Look Ahead, and a short close. The script is written only from the published edition (no other source is consulted, and a script naming anything not in the edition is rejected before any audio is made), then read by a standard neural text-to-speech voice in the edition's language. The voices are standard voices for the language, not regional dialects; each edition keeps its own voice. Made each morning before 07:30 local time for editions that have it enabled (currently GEDI's four quartieri, in Italian).

```json
"audio": {
  "url": "https://<project>.supabase.co/storage/v1/object/public/edition-audio/sicily-scicli/2026-09-28.mp3?v=m1abcd",
  "duration_s": 74.5,
  "voice": "it-IT-GiuseppeNeural"
}
```

| Field | Meaning |
|---|---|
| `url` | An MP3 (24 kHz mono, 48 kbit/s) you may play or copy to your own storage. The link does not expire. |
| `duration_s` | Length in seconds. |
| `voice` | The text-to-speech voice used. |

`audio` is `null` when no audio was made for this date, when it was made in a different language from the one returned (`language`), or when it was made from a different version of the Daily Brief or Look Ahead than the one returned.

### 3. Story-by-story feed

```
GET /api/v1/stories?editions=a,b&since=ISO&limit=50&cursor=...
```

| Parameter | Required | Meaning |
|---|---|---|
| `editions` | no | Comma-separated edition ids. Defaults to all your editions. Any id your key is not licensed for returns `404` for the whole request. |
| `since` | no | Only stories published at or after this time (ISO 8601). Defaults to 48 hours ago. Anything older than 30 days is treated as 30 days. |
| `limit` | no | Stories per page, 1 to 200. Default 50. |
| `cursor` | no | The `next_cursor` from the previous page. Send the same `editions` and `since` with it. |

```bash
curl -H "Authorization: Bearer $KEY" \
  "https://readflaneur.com/api/v1/stories?editions=berlin-prenzlauer-berg,paris-le-marais&since=2026-09-22T00:00:00Z&limit=2"
```

```json
{
  "version": "v1",
  "stories": [
    {
      "id": "54b15b79d5ca9302d05d18c8",
      "position": 0,
      "header": "The Final Note",
      "text": "For anyone who has been enjoying the city's concert halls, take note: ...",
      "sources": [
        { "name": "visitBerlin.de", "url": "https://www.visitberlin.de/en/event/musikfest-berlin-2026" }
      ],
      "place": {
        "edition_id": "berlin-prenzlauer-berg",
        "name": "Prenzlauer Berg",
        "city": "Berlin",
        "country": "Germany"
      },
      "edition_id": "berlin-prenzlauer-berg",
      "article_id": "ff4a9df4-a119-4585-954d-ab5588b4834c",
      "published_at": "2026-09-22T22:02:03.445+00:00"
    },
    {
      "id": "1dc9b8546292392c51e50491",
      "position": 1,
      "header": "Weekend Plans, Sorted",
      "text": "If you're already thinking about the weekend, ...",
      "sources": [
        { "name": "visitBerlin.de", "url": "https://www.visitberlin.de/en/event/jump-joy-kulturmarkthalle" }
      ],
      "place": { "edition_id": "berlin-prenzlauer-berg", "name": "Prenzlauer Berg", "city": "Berlin", "country": "Germany" },
      "edition_id": "berlin-prenzlauer-berg",
      "article_id": "ff4a9df4-a119-4585-954d-ab5588b4834c",
      "published_at": "2026-09-22T22:02:03.445+00:00"
    }
  ],
  "next_cursor": "eyJwIjoiMjAyNi0wOS0yMlQyMjowMjowMy40NDUrMDA6MDAiLCJhIjoiZmY0YTlkZjQtYTExOS00NTg1LTk1NGQtYWI1NTg4YjQ4MzRjIiwiaSI6MX0"
}
```

Each item has every field of a story in the daily edition, plus `edition_id`, `article_id` (the Daily Brief it belongs to) and `published_at` (when that Daily Brief was published). Items are ordered newest Daily Brief first and, within one Daily Brief, in reading order. `next_cursor` is `null` on the last page.

This endpoint carries Daily Brief stories. Look Ahead events are in the daily edition endpoint, because they are a listing rather than stories.

**Polling pattern.** Poll every 15 to 30 minutes with `since` set to your last successful poll minus one hour, page through with `cursor`, and skip story ids you already hold. Story ids never change, so the overlap is harmless and protects you against a delayed publication.

## When content is available

Editions are built overnight in each edition's own timezone:

- **Daily Brief**: generated between midnight and 07:00 local time, with a new attempt every 15 minutes in that window. On a normal day it is published within the first hour after local midnight. A brief delayed by an upstream failure can arrive later in the window.
- **Look Ahead**: released at 07:00 local time. The feed does not return it before then.

A field is `null` until its part is published; poll again rather than treating `null` as final. On a day when generation fails for the whole window, that day's Daily Brief stays `null`, and we do not backfill missed days. Nothing is published with a future timestamp in this feed.

The daily edition for past dates stays available. The story feed reaches back 30 days.

## Languages

Editions are written in English, with local names and phrases kept in the original language. Any edition can be requested in `de`, `fr`, `es`, `it`, `pt`, `sv`, `nb` (Norwegian Bokmål), `zh` or `ja` with `lang`, or `en` for the original. A default language can be agreed for your key at onboarding, so you need not send `lang` on every call.

Translations are made once and stored. The first request for a given edition, date and language translates on demand and can take 10 to 20 seconds; every later request for it is immediate. Allow for that on the first call of the morning.

If a translation fails, the response carries the original English content, `language` says `en`, and `requested_language` says what you asked for. A later request retries the translation.

The story feed (`/stories`) is in the original language only.

## Caching, limits and errors

- Successful responses carry `Cache-Control: private, max-age=300`. Content for a given edition and date does not change after publication except for corrections, so caching for five minutes is safe.
- Every response carries `X-Robots-Tag: noindex, nofollow`. The feed is for licensees and is not indexed.
- **Rate limit: 60 requests per minute per key.** Beyond that you receive `429` with a `Retry-After` header in seconds. The limit is counted per server instance, so treat it as a ceiling to stay under, not a quota to use up. Normal polling needs a few requests a minute at most.

Errors have one shape:

```json
{ "error": { "code": "edition_not_found", "message": "No edition \"example-id\" for this key." } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | Malformed `date`, `since`, `limit` or `cursor`, a date after today, or an unsupported `lang`. |
| 401 | `unauthorized` | Missing or unrecognised key. |
| 404 | `edition_not_found` | Edition not licensed to your key, or not found. |
| 429 | `rate_limited` | Over 60 requests in a minute. |
| 500 | `internal_error` | A fault on our side. Retry with backoff. |

Error responses are never cached.

## Versioning

The version is in the path (`/api/v1`) and in every response (`"version": "v1"` and the `X-Feed-Version` header). Within v1 we may add fields and endpoints; we will not remove or rename a field or change its meaning. Ignore fields you do not recognise. A breaking change gets a new version path, and v1 keeps running alongside it for a notice period agreed with licensees.

## Editorial rules and source blocking

Each licensee has its own rule set, agreed at onboarding and applied before anything reaches the feed. There are no request parameters for it; changing a rule is a configuration change on our side, and it takes effect from the next morning's editions.

**Blocking sources.** A blocked source can be any of:

- a whole site, by domain (`example-competitor.de` also blocks `www.` and every other subdomain);
- one page, account or group on a platform, by its address (`facebook.com/groups/123456`, `instagram.com/somepage`, `x.com/somehandle`; `twitter.com` addresses are treated as `x.com`);
- a publication, by name.

Blocking is enforced twice. The search that gathers each edition's facts is told not to use blocked sources. Then, before publication, a check removes every blocked source from every story, removes links to it from the text, and drops any story that no longer meets the sourcing rule without it. A story that rested on a blocked source does not appear.

**Sourcing.** A named person, date or figure needs two independent sources, unless one of them is a newspaper of record from the licensee's agreed list, which can stand alone. Where a story rests on social media, the second source must be a different kind (an official site, a published notice, a news outlet).

**Topics.** A licensee can exclude whole topics (for example active criminal cases, party politics, sports commentary, or any subject named at onboarding). Private individuals are not named, and personal details about them are removed.

**Review before publication.** Stories that pass the fixed rules are checked by a second model against the gathered sources before publication; a story whose claims the sources do not support is dropped.

**The record of what was cut.** Every story removed by a rule is logged with the rule that removed it, so an editor can see exactly what was left out and why.

## Editorial approval (licensees that require it)

A licensee can require that a person on its own staff approves each item before the feed carries it. The licensee's editors work on a private editor desk (a web page we provide, one per licensee) where they approve, hold, edit or restore each item of each morning's editions: the Daily Brief headline, each story, the Look Ahead text and each Look Ahead event. Our public pages are not affected; the desk governs only what that licensee's feed carries.

For such a licensee:

- `daily_brief.stories` contains only approved stories, with the editor's header and text where they rewrote them. Each story carries `editorial: { status, edited, decided_by, decided_at }`; `status` is always `"approved"` in the feed.
- `daily_brief.body_markdown` is rebuilt from the approved stories only (greeting, `## Header` sections, sign-off).
- `daily_brief.headline` and `subject_teaser` are `null` until the headline is approved.
- `daily_brief.editorial` gives the headline's status and `withheld: { pending, held }`, the number of stories left out.
- `look_ahead.body_markdown` is `null` until the Look Ahead text is approved; `look_ahead.events` contains only approved events; `look_ahead.editorial` gives the prose status and the events withheld.
- `/api/v1/stories` returns only approved stories, edited.
- `audio` is `null` until every story and event the audio reads is approved without edits. The audio is spoken from the edition as published, so an edit or a held item would make it say something your feed does not carry.

Nothing is carried by default: if no editor has acted, the edition is empty. A story's `id` is the key the desk records its decision under, so the same story keeps the same id before and after approval. An edit is stored in the language the editor wrote it in and is carried in every language.
