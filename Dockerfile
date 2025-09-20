# Multi-stage build for production optimization and security

FROM node:18-alpine AS base

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    tzdata && \
    rm -rf /var/cache/apk/*

# Set timezone to UK
ENV TZ=Europe/London
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Create app directory and user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nhsapp -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

FROM base AS dependencies

# Install all dependencies
RUN npm ci --only=production && npm cache clean --force

FROM base AS development

# Install all dependencies including dev dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R nhsapp:nodejs /app

USER nhsapp

# Expose port
EXPOSE 3000 9229

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start with nodemon for development
CMD ["npm", "run", "dev"]

FROM base AS build

# Copy node_modules from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies and source files
RUN npm ci --only=production && npm cache clean --force && \
    rm -rf src tests *.config.js

FROM base AS production

# Copy built application and production node_modules
COPY --from=build --chown=nhsapp:nodejs /app/dist ./dist
COPY --from=build --chown=nhsapp:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nhsapp:nodejs /app/package*.json ./

# Create logs directory
RUN mkdir -p /app/logs && chown -R nhsapp:nodejs /app/logs

# Switch to non-root user
USER nhsapp

# Expose port
EXPOSE 3000

# Health check for production
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
