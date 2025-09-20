# NHS GP Booking System - Deployment Runbook

## Overview
This runbook provides step-by-step instructions for deploying the NHS GP Booking System to production environments.

## Prerequisites

### NHS Digital Credentials
- Valid ASID (Accredited System ID)
- NHS Digital Party Key
- GP Connect endpoint access
- SSL certificates for production

### Infrastructure Requirements
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+
- SSL/TLS certificates
- Monitoring infrastructure (Prometheus, Grafana)

## Deployment Steps

### 1. Environment Setup
```bash
# Copy environment template
cp .env.example .env.production

# Configure NHS Digital credentials
nano .env.production
```

Required variables:
- `NHS_ASID`: Your NHS Digital ASID
- `NHS_PARTY_KEY`: NHS Digital Party Key
- `GP_CONNECT_ASID`: GP Connect ASID
- `DB_PASSWORD`: Secure database password
- `JWT_SECRET`: JWT signing secret
- `REDIS_PASSWORD`: Redis password

### 2. SSL Certificate Setup
```bash
# Place certificates in certs/ directory
mkdir -p certs
cp your-ssl-cert.pem certs/
cp your-ssl-key.pem certs/
cp ca-bundle.pem certs/
```

### 3. Database Migration
```bash
# Run database migrations
docker-compose run --rm nhs-booking-api npm run db:migrate

# Seed with GP practice data
docker-compose run --rm nhs-booking-api npm run db:seed
```

### 4. Production Deployment
```bash
# Use the deployment script
./scripts/deploy-nhs-booking.sh
```

### 5. Post-Deployment Verification
- Check all health endpoints
- Verify NHS Digital connectivity
- Test appointment booking flow
- Review audit logs
- Confirm monitoring is active

## Rollback Procedure

### Emergency Rollback
```bash
# Stop current deployment
docker-compose down

# Restore from backup
docker-compose -f docker-compose.rollback.yml up -d

# Verify rollback successful
curl http://localhost:3000/health
```

## Monitoring

### Key Metrics to Monitor
- API response times
- Database connection pool
- NHS Digital API success rates
- Authentication failures
- Audit log volumes

### Alerting Thresholds
- API response time > 2 seconds
- Error rate > 1%
- Database connections > 80%
- Failed authentications > 10/minute

## Troubleshooting

### Common Issues

#### NHS Digital Connection Failures
1. Check ASID configuration
2. Verify SSL certificates
3. Check firewall rules
4. Review NHS Digital service status

#### Database Connection Issues
1. Check PostgreSQL service status
2. Verify connection strings
3. Check database credentials
4. Review connection pool settings

#### High Memory Usage
1. Check for memory leaks
2. Review connection pooling
3. Monitor Redis memory usage
4. Check for long-running queries

## Security Checklist

- [ ] SSL certificates are valid and not expired
- [ ] All secrets are properly encrypted
- [ ] Database access is restricted
- [ ] Audit logging is enabled
- [ ] Security headers are configured
- [ ] Rate limiting is active
- [ ] Input validation is working

## Compliance Requirements

### NHS Digital Compliance
- DSP Toolkit requirements met
- Audit trails are comprehensive
- Data encryption at rest and in transit
- Access controls properly configured

### GDPR Compliance
- Data minimization principles applied
- Patient consent mechanisms active
- Data retention policies enforced
- Right to erasure implemented
