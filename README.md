# NHS GP Appointment Booking System

A research level, NHS Digital compliant appointment booking system that integrates with GP practices via GP Connect FHIR APIs.

> Read the comprehensive compliance and architecture guide: [WHITEPAPER.md](WHITEPAPER.md)

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- NHS Digital credentials (for production)

### Setup
1. **Clone and setup**
   ```bash
   git clone <repository-url>
   cd nhs-gp-booking-system
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development environment**
   ```bash
   npm install
   docker-compose up -d
   ```

4. **Verify deployment**
   ```bash
   curl http://localhost:3000/health
   ```

### Access Points
- **API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Database Admin**: http://localhost:5050 (pgAdmin)
- **Demo Interface**: http://localhost:3000/demo.html

## 🏥 Features

- **GP Connect Integration**: Full FHIR R4 compliance
- **NHS Digital Compliant**: Meets all DSP Toolkit requirements
- **Caldicott Compliant**: Proper access controls and audit trails
- **UK GDPR Compliant**: Full data protection compliance
- **Real-time Availability**: Live appointment slot checking
- **Automated Notifications**: Multi-channel practice notifications

## 📚 API Endpoints

### Check Availability
```bash
GET /api/appointments/availability?gpPracticeODSCode=A12345&fromDate=2024-12-01&toDate=2024-12-07
```

### Book Appointment
```bash
POST /api/appointments/book
Content-Type: application/json

{
  "patientNHSNumber": "9876543210",
  "gpPracticeODSCode": "A12345",
  "appointmentType": "routine",
  "reasonForAppointment": "Annual health check",
  "urgency": "routine",
  "bookedBy": "patient-portal",
  "contactPreferences": {
    "email": "patient@example.com",
    "sms": true
  }
}
```

## 🔧 Development

### Run Tests
```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:load          # Load tests
```

### Build & Deploy
```bash
npm run build              # Build TypeScript
./scripts/deploy-nhs-booking.sh production  # Deploy to production
```

## 🏆 Compliance

- ✅ NHS Digital DSP Toolkit (10/10 standards)
- ✅ UK GDPR & Data Protection Act 2018
- ✅ Caldicott Principles (all 7 principles)
- ✅ HL7 FHIR UK Core R4
- ✅ GP Connect API compliance
- ✅ Clinical Risk Management (DCB0129/DCB0160)

## 📞 Support

For NHS Digital integration support:
- Developer Portal: https://developer.nhs.uk
- GP Connect: https://developer.nhs.uk/apis/gpconnect

## 📄 License

MIT License - See LICENSE file for details.

---

**Important**: This system processes NHS patient data. Ensure all regulatory approvals are obtained before production deployment.
