# Snacks Business App — Project Summary

## Context

My mother runs a small artisanal snacks business in Pune. She is a former stay-at-home mother who took to entrepreneurship recently — her primary motivation is meaningful engagement, confidence-building, and staying active, not profit maximisation. She has a team of 8–10 part-time women with fixed schedules. She sells through three channels: 8–10 shopkeeper accounts who resell her products, a personal network of friends/relatives/acquaintances who place direct orders, and exhibitions/fairs where she sells and acquires new customers.

## How She Currently Operates

- Orders come in via WhatsApp; she records them in a notebook diary
- Payments tracked in notebook, fairly on top of it
- Production is intuition-based, no formal plan
- She is Android-savvy and comfortable with apps, but has never used Excel or any productivity software
- Team coordination is smooth and not a pain point

## Key Problems to Solve

1. **Production planning** — she consistently underproduces. Demand reliably exceeds supply. She has no method for estimating how much to make. This is the highest-leverage problem.
2. **Customer and order history** — she has no structured record of customers, especially those acquired through exhibitions. As she grows, this becomes a real gap.

## Product Catalogue

- 5–10 core hero products, produced year-round
- Seasonal/festival products added periodically
- She sometimes aggregates products from other home-based women entrepreneurs and sells them with disclosure

## Technical Decisions Made

- Build as a **Progressive Web App (PWA)** — React frontend, Supabase backend
- Built by me using Claude Code as development environment and coach
- I am a complete beginner but a fast learner
- The app should make her an **active participant** — she logs orders, production, new customers — not just a dashboard consumer
- Mobile-first, big buttons, dropdown-heavy, minimal typing — 30-second interactions

## Proposed Feature Phases

### Phase 1 — MVP
- Customer directory (name, contact, channel, notes)
- Product catalogue (name, unit, price)
- Order logging (who ordered what, when, how much, payment status)
- Production log (date, product, quantity made)

### Phase 2 — Intelligence Layer
- Production dashboard with demand-based suggestions (average weekly demand per product, suggested make quantity)
- Low stock alerts when orders outpace production
- Customer order history (tap a customer, see everything they've ordered)

### Phase 3 — Growth Features
- Exhibition mode — quick, finger-friendly order capture designed for use at a stall
- Aggregated product flagging — mark items sourced from other makers, with a note
- Seasonal product tagging — mark festival-specific items, toggle on/off

## Her Primary Input Workflows

The app should support four core daily actions, each completable in ~30 seconds on her phone:

1. **Log an order** — select customer, select products + quantities, done
2. **Log production** — today I made X units of Y product
3. **Mark order fulfilled** — this went out today
4. **Add a new customer** — especially post-exhibition

## Questions to Ask Her Before Building

To validate the direction without asking "what do you want from an app" (which she won't know), ask her about her experience instead:

- *"What's the most annoying part of your week with the business?"*
- *"Has there ever been a situation where you wished you had remembered something but didn't?"*
- *"When a new customer contacts you after an exhibition, what do you do — how do you keep track of them?"*
- *"When you decide how much to make in a week, how do you figure that out?"*

## Status

Phase breakdown agreed in principle. Next steps:
1. Validate with her using the experience-based questions above
2. Return to begin Phase 1 build
3. First dev session: set up environment — Node, React, Supabase
