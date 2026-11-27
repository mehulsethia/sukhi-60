# Sukhi Care: production image. Starts with no keys (keyless mode: landing page + guided demo).
# Add keys through .env (see .env.example) to enable sign-in, AI, voice and WhatsApp.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# 1. Dependencies (cached unless the lockfile changes)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Build. NEXT_PUBLIC_* values are inlined into the browser bundle at build time,
#    so they are build arguments. All of them are optional.
FROM base AS build
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# 3. Run
FROM base AS run
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
