---
description: How to build and test the backend Docker container locally
---

# Local Docker Build

Builds the backend Docker image locally, mirroring the Cloud Run build.

## Steps

// turbo

1. Build the Docker image from the repo root:

```bash
npm run docker:build
```

2. (Optional) Smoke-test the image by running it locally:

```bash
docker run --rm -p 5001:5001 toast-stats-backend
```

Then verify `http://localhost:5001/health` returns a healthy response.

## Notes

- The build uses the repo root as context since the backend depends on workspace packages (`shared-contracts`, `analytics-core`).
- Docker layer caching means rebuilds after source-only changes are fast (the `npm ci` layer is cached).
- This runs automatically on `git push` via the Husky pre-push hook.
