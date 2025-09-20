#!/bin/bash

# NHS GP Booking System Deployment Script
# This script deploys the NHS GP booking system to production

set -e

echo "🏥 NHS GP Booking System - Production Deployment"
echo "================================================="

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root for security reasons"
   exit 1
fi

# Check required environment variables
if [[ -z "$NHS_ASID" || -z "$DB_PASSWORD" || -z "$JWT_SECRET" ]]; then
    echo "❌ Required environment variables not set"
    echo "   Please ensure NHS_ASID, DB_PASSWORD, and JWT_SECRET are configured"
    exit 1
fi

# Check Docker is installed and running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running"
    exit 1
fi

# Check Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p logs certs database/backup

# Set proper permissions
chmod 700 certs
chmod 755 logs
chmod 755 database/backup

# Pull latest images
echo "📦 Pulling latest Docker images..."
docker-compose pull

# Build the application
echo "🔨 Building application..."
docker-compose build --no-cache

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose run --rm nhs-booking-api npm run db:migrate

# Start services
echo "🚀 Starting NHS GP Booking System..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 30

# Check service health
echo "🔍 Checking service health..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ NHS GP Booking API is healthy"
else
    echo "❌ NHS GP Booking API health check failed"
    docker-compose logs nhs-booking-api
    exit 1
fi

# Check database health
if curl -f http://localhost:3000/health/database > /dev/null 2>&1; then
    echo "✅ Database connection is healthy"
else
    echo "❌ Database health check failed"
    docker-compose logs postgres
    exit 1
fi

echo ""
echo "🎉 NHS GP Booking System deployed successfully!"
echo ""
echo "📊 Service URLs:"
echo "   API: http://localhost:3000"
echo "   Health: http://localhost:3000/health"
echo "   Metrics: http://localhost:3000/metrics"
echo "   Grafana: http://localhost:3001 (admin/admin)"
echo "   Prometheus: http://localhost:9090"
echo ""
echo "📋 Next steps:"
echo "   1. Configure NHS Digital certificates in ./certs/"
echo "   2. Update GP practice endpoints in database"
echo "   3. Configure monitoring alerts"
echo "   4. Run security scan: npm run test:security"
echo ""
echo "🔒 Security reminders:"
echo "   - Ensure all NHS Digital certificates are valid"
echo "   - Review audit logs regularly"
echo "   - Keep all dependencies updated"
echo "   - Monitor for security vulnerabilities"
echo ""

# Show running containers
docker-compose ps
