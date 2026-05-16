# Founding Partner - Broker Outreach Kit

Free "Founding Partner" mode is live: a broker activates at `/partner` with no
payment and no Stripe. The product is no longer the constraint - reaching
brokers warmly is. Cold blasts produced 0 replies from ~950 emails. Use these
for ONE-AT-A-TIME, warm or semi-warm outreach: people you or your network know,
targeted individual LinkedIn messages, warm intros.

---

## Email template (warm / introduced)

**Subject:** [Neighborhood] has one broker spot, and it's open

Hi [First name],

I run Flaneur. We publish a daily neighborhood newsletter, and we cover
[Neighborhood] every morning - what's opening, what's selling, what's happening
on the streets your clients care about.

The relevant part for you: each neighborhood has exactly one real estate
partner, and [Neighborhood] is unclaimed. As the partner, that morning email
goes out under your name and photo, with your listings, to your own client
list. 365 mornings a year your past clients hear from you, not a competitor.

It is free for founding partners while we are in beta. No card, no catch. If we
introduce pricing later, your founding rate is locked in.

Setup takes about five minutes, and I've pre-filled your details here:
[PREFILL LINK]

Prefer to see it first? I'll send a real sample edition for [Neighborhood] -
just reply "sample".

Morgan Downey
Founder, Flaneur
readflaneur.com

---

## LinkedIn / short DM (colder contact)

Hi [First name] - I run Flaneur, a daily neighborhood newsletter. We cover
[Neighborhood], and we give one real estate broker per neighborhood an
exclusive: the daily email goes out branded as yours, with your listings, to
your client list, 365 mornings a year. [Neighborhood] is still open, and it's
free for founding partners while we're in beta. Want me to send a sample
edition so you can see it?

---

## Personalize every send (do not skip this)

- Use their first name and their actual neighborhood, every time.
- Add one specific detail if you can: a recent listing of theirs, their
  brokerage, a particular street. It signals this is not a blast.
- Send one at a time, from a normal personal inbox. Not the outreach
  subdomain, not a bulk tool. Cold blasting is exactly what got 0 replies.
- The goal of the first message is a reply, not an activation.

---

## Pre-filled setup link

`/partner/setup` reads URL params and fills the form, so the broker is not
re-typing what you already know.

**Format:**

```
https://readflaneur.com/partner/setup?neighborhood=ID&name=NAME&email=EMAIL&brokerage=BROKERAGE&title=TITLE&phone=PHONE
```

- `neighborhood` MUST be the exact neighborhood ID, e.g. `nyc-tribeca`,
  `london-mayfair`, `stockholm-ostermalm`, `la-beverly-hills`. The full list of
  IDs is in `outreach/flaneur-neighborhoods.csv`.
- URL-encode the values: a space becomes `%20`, an apostrophe becomes `%27`
  (so `Sotheby's` becomes `Sotheby%27s`).
- Any param can be omitted - include only what you know.

**Worked example:**

```
https://readflaneur.com/partner/setup?neighborhood=nyc-tribeca&name=James%20Chen&email=james@example.com&brokerage=Sotheby%27s%20International%20Realty&title=Senior%20Broker
```

This pre-fills steps 1 and 2 (neighborhood + their details). The broker still
adds a headshot, listings (optional), their client emails, and sends a preview
before activating. So it is "arrives personalized, about five minutes", not
literally one click. The client-email step is the real ask, which is why warm
framing matters - they have to trust you enough to paste their list.
