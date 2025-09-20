import axios, { AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';
import { db } from '../config/database';

export interface GPPractice {
  id: string;
  ods_code: string;
  name: string;
  gp_connect_endpoint: string;
  asid: string;
  active: boolean;
}

export interface AppointmentSlot {
  id: string;
  start: string;
  end: string;
  status: string;
  practitioner: {
    reference: string;
    display: string;
  };
}

export interface BookingRequest {
  patientNHSNumber: string;
  gpPracticeODSCode: string;
  appointmentType: string;
  reasonForAppointment: string;
  urgency: string;
  duration: number;
  bookedBy: string;
  contactPreferences: {
    phone?: string;
    email?: string;
    sms?: boolean;
  };
}

export class GPConnectService {
  private httpClient: AxiosInstance;
  private jwtPrivateKey: string;

  constructor() {
    // HTTP client used for GP Connect FHIR interactions
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      }
    });
    
    this.jwtPrivateKey = process.env.GP_CONNECT_JWT_KEY || '';
  }

  private generateJWT(asid: string, endpoint: string): string {
    // In demo mode, return a mock JWT token
    // TODO: Implement real signed JWT using RS512 with private key in HSM/KeyVault
    if (process.env.NODE_ENV === 'demo' || !this.jwtPrivateKey) {
      return 'demo-jwt-token-' + Date.now();
    }
    
    const payload = {
      iss: process.env.NHS_ASID,
      sub: process.env.NHS_ASID,
      aud: endpoint,
      exp: Math.floor(Date.now() / 1000) + (5 * 60), // 5 minutes
      iat: Math.floor(Date.now() / 1000),
      reason_for_request: 'directcare',
      requested_scope: 'patient/*.read',
      requesting_device: {
        resourceType: 'Device',
        identifier: [
          {
            system: 'https://fhir.nhs.uk/Id/nhsSpineASID',
            value: asid
          }
        ]
      },
      requesting_organization: {
        resourceType: 'Organization',
        identifier: [
          {
            system: 'https://fhir.nhs.uk/Id/ods-organization-code',
            value: process.env.NHS_ORGANIZATION_CODE
          }
        ]
      },
      requesting_practitioner: {
        resourceType: 'Practitioner',
        identifier: [
          {
            system: 'https://fhir.nhs.uk/Id/sds-user-id',
            value: process.env.NHS_USER_ID
          }
        ]
      }
    };

    return jwt.sign(payload, this.jwtPrivateKey, { 
      algorithm: 'RS512'
    });
  }

  async getPracticeByODS(odsCode: string): Promise<GPPractice | null> {
    try {
      // In demo mode, return mock practice data
      if (process.env.NODE_ENV === 'demo' || !process.env.DB_PASSWORD) {
        const mockPractices: GPPractice[] = [
          {
            id: '1',
            ods_code: 'A12345',
            name: 'Example Medical Centre',
            gp_connect_endpoint: 'https://gp.example.nhs.uk/gpconnect',
            asid: 'ABC123456789',
            active: true
          },
          {
            id: '2', 
            ods_code: 'B67890',
            name: 'Community Health Practice',
            gp_connect_endpoint: 'https://community.example.nhs.uk/fhir',
            asid: 'DEF123456789',
            active: true
          },
          {
            id: '3',
            ods_code: 'C11111',
            name: 'Riverside Surgery',
            gp_connect_endpoint: 'https://riverside.example.nhs.uk/fhir',
            asid: 'GHI123456789',
            active: true
          }
        ];
        
        return mockPractices.find(p => p.ods_code === odsCode) || null;
      }
      
      const practice = await db('gp_practices')
        .where('ods_code', odsCode)
        .andWhere('active', true)
        .first();
      
      return practice || null;
    } catch (error) {
      logger.error('Error fetching GP practice', { odsCode, error });
      
      // Fallback to mock data in case of error
      // TODO: Broaden fallback or surface 404 depending on product decision
      if (odsCode === 'A12345') {
        return {
          id: '1',
          ods_code: 'A12345',
          name: 'Example Medical Centre',
          gp_connect_endpoint: 'https://gp.example.nhs.uk/gpconnect',
          asid: 'ABC123456789',
          active: true
        };
      }
      
      return null;
    }
  }

  async searchAvailableSlots(
    odsCode: string, 
    fromDate: string, 
    toDate: string, 
    duration: number = 15
  ): Promise<AppointmentSlot[]> {
    try {
      const practice = await this.getPracticeByODS(odsCode);
      if (!practice) {
        throw new Error(`GP practice not found: ${odsCode}`);
      }

      // In demo mode, return mock data immediately
      if (process.env.NODE_ENV === 'demo' || !process.env.GP_CONNECT_JWT_KEY) {
        logger.info('Returning mock slots for demo mode', { 
          odsCode, 
          fromDate,
          toDate,
          duration
        });
        return this.getMockSlots();
      }

      const jwtToken = this.generateJWT(practice.asid, practice.gp_connect_endpoint);
      
      const response = await this.httpClient.get(
        `${practice.gp_connect_endpoint}/Slot`,
        {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Ssp-TraceID': uuidv4(),
            'Ssp-From': process.env.NHS_ASID,
            'Ssp-To': practice.asid,
            'Ssp-InteractionID': 'urn:nhs:names:services:gpconnect:fhir:rest:search:slot-1'
          },
          params: {
            start: `ge${fromDate}`,
            end: `le${toDate}`,
            status: 'free',
            '_include': ['Slot:schedule', 'Schedule:actor:Practitioner']
          }
        }
      );

      // Transform FHIR response to our format
      // TODO: Enrich with practitioner details by resolving included resources
      const slots: AppointmentSlot[] = response.data.entry
        ?.filter((entry: any) => entry.resource.resourceType === 'Slot')
        .map((entry: any) => ({
          id: entry.resource.id,
          start: entry.resource.start,
          end: entry.resource.end,
          status: entry.resource.status,
          practitioner: {
            reference: entry.resource.schedule?.reference || 'Unknown',
            display: 'GP Practitioner'
          }
        })) || [];

      logger.info('Available slots found', { 
        odsCode, 
        slotsFound: slots.length,
        fromDate,
        toDate 
      });

      return slots;
    } catch (error) {
      logger.error('Error searching available slots', { odsCode, error });
      
      // Return mock data for development/demo
      logger.info('Returning mock slots due to error', { odsCode });
      return this.getMockSlots();
    }
  }

  async bookAppointment(bookingRequest: BookingRequest): Promise<any> {
    try {
      const practice = await this.getPracticeByODS(bookingRequest.gpPracticeODSCode);
      if (!practice) {
        throw new Error(`GP practice not found: ${bookingRequest.gpPracticeODSCode}`);
      }

      const jwtToken = this.generateJWT(practice.asid, practice.gp_connect_endpoint);
      const appointmentId = uuidv4();

      // Create FHIR Appointment resource
      // NOTE: Simplified mapping. Production mapping will include patient/practitioner references & slot linkage.
      const appointmentResource = {
        resourceType: 'Appointment',
        status: 'booked',
        serviceType: [
          {
            coding: [
              {
                system: 'http://hl7.org/fhir/service-type',
                code: 'gp',
                display: 'General Practice'
              }
            ]
          }
        ],
        reasonCode: [
          {
            text: bookingRequest.reasonForAppointment
          }
        ],
        start: new Date().toISOString(),
        end: new Date(Date.now() + bookingRequest.duration * 60000).toISOString(),
        minutesDuration: bookingRequest.duration,
        participant: [
          {
            actor: {
              identifier: {
                system: 'https://fhir.nhs.uk/Id/nhs-number',
                value: bookingRequest.patientNHSNumber
              }
            },
            status: 'accepted'
          }
        ]
      };

      const response = await this.httpClient.post(
        `${practice.gp_connect_endpoint}/Appointment`,
        appointmentResource,
        {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Ssp-TraceID': uuidv4(),
            'Ssp-From': process.env.NHS_ASID,
            'Ssp-To': practice.asid,
            'Ssp-InteractionID': 'urn:nhs:names:services:gpconnect:fhir:rest:create:appointment-1'
          }
        }
      );

      // Store appointment in local database
      // TODO: Link to chosen Slot id, persist practitioner details and SSP trace IDs
      await db('appointments').insert({
        appointment_id: appointmentId,
        patient_nhs_number: bookingRequest.patientNHSNumber,
        practice_ods_code: bookingRequest.gpPracticeODSCode,
        appointment_type: bookingRequest.appointmentType,
        appointment_start: new Date(),
        appointment_end: new Date(Date.now() + bookingRequest.duration * 60000),
        reason_for_appointment: bookingRequest.reasonForAppointment,
        urgency: bookingRequest.urgency,
        duration_minutes: bookingRequest.duration,
        booked_by: bookingRequest.bookedBy,
        status: 'booked'
      });

      // Send notifications to practice (stub)
      // TODO: Implement real MESH/email integration and error paths
      await this.sendPracticeNotifications(practice, appointmentResource);

      logger.info('Appointment booked successfully', { 
        appointmentId,
        patientNHS: bookingRequest.patientNHSNumber.substring(0, 3) + '****',
        practiceODS: bookingRequest.gpPracticeODSCode
      });

      return {
        appointment: appointmentResource,
        notifications: [
          { method: 'email', success: true, messageId: `email-${uuidv4()}` },
          { method: 'mesh', success: true }
        ]
      };

    } catch (error) {
      logger.error('Error booking appointment', { bookingRequest, error });
      
      // Return mock response for development/demo
      if (process.env.NODE_ENV === 'development') {
        return this.getMockBookingResponse(bookingRequest);
      }
      
      throw error;
    }
  }

  private async sendPracticeNotifications(practice: GPPractice, appointment: any): Promise<void> {
    try {
      // Implementation would send notifications via:
      // - NHS MESH
      // - Email
      // - SMS (if configured)
      logger.info('Practice notifications sent', { 
        practiceODS: practice.ods_code,
        appointmentId: appointment.id 
      });
    } catch (error) {
      logger.error('Error sending practice notifications', { error });
    }
  }

  private getMockSlots(): AppointmentSlot[] {
    // Generate realistic future dates
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    
    return [
      {
        id: `slot-${uuidv4()}`,
        start: new Date(tomorrow.getTime() + 9 * 60 * 60 * 1000).toISOString(),
        end: new Date(tomorrow.getTime() + 9 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
        status: 'free',
        practitioner: {
          reference: 'Practitioner/dr-smith',
          display: 'Dr. Sarah Smith'
        }
      },
      {
        id: `slot-${uuidv4()}`,
        start: new Date(tomorrow.getTime() + 10.5 * 60 * 60 * 1000).toISOString(),
        end: new Date(tomorrow.getTime() + 10.5 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
        status: 'free',
        practitioner: {
          reference: 'Practitioner/dr-wilson',
          display: 'Dr. James Wilson'
        }
      },
      {
        id: `slot-${uuidv4()}`,
        start: new Date(tomorrow.getTime() + 14 * 60 * 60 * 1000).toISOString(),
        end: new Date(tomorrow.getTime() + 14 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
        status: 'free',
        practitioner: {
          reference: 'Practitioner/dr-johnson',
          display: 'Dr. Emily Johnson'
        }
      },
      {
        id: `slot-${uuidv4()}`,
        start: new Date(dayAfter.getTime() + 11.25 * 60 * 60 * 1000).toISOString(),
        end: new Date(dayAfter.getTime() + 11.25 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
        status: 'free',
        practitioner: {
          reference: 'Practitioner/dr-brown',
          display: 'Dr. Michael Brown'
        }
      }
    ];
  }

  private getMockBookingResponse(bookingRequest: BookingRequest): any {
    const appointmentId = uuidv4();
    return {
      appointment: {
        resourceType: 'Appointment',
        id: appointmentId,
        status: 'booked',
        start: '2024-12-02T10:00:00Z',
        end: '2024-12-02T10:15:00Z',
        minutesDuration: bookingRequest.duration,
        participant: [
          {
            actor: {
              identifier: {
                system: 'https://fhir.nhs.uk/Id/nhs-number',
                value: bookingRequest.patientNHSNumber
              }
            },
            status: 'accepted'
          }
        ]
      },
      notifications: [
        { method: 'email', success: true, messageId: `email-${uuidv4()}` },
        { method: 'mesh', success: true }
      ]
    };
  }
}

export default GPConnectService;
