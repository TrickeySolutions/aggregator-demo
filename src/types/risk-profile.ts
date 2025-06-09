/**
 * Risk Profile Type Definitions
 * 
 * TODO: These types are currently not in use but are intended for future implementation to:
 * - Add type safety to form data collection and validation
 * - Implement structured risk scoring and assessment
 * - Enforce consistent data shape for partner quote processing
 * - Provide better TypeScript support for activity state management
 * 
 * Implementation Plan:
 * 1. Update ActivityState interface to use these types for formData
 * 2. Add runtime validation using these interfaces
 * 3. Implement risk scoring based on SecurityPosture and IncidentHistory
 * 4. Type partner quote responses using these interfaces
 * 5. Add form validation against these type definitions
 * 
 * Defines the structure for risk assessment and profile calculation
 */

export interface OrganizationDetails {
  name: string;
  annualBudget: number;
  employeeCount: number;
  personalDataRecordCount: number;
  sector: 'Public sector – Local government';
}

export interface SecurityPosture {
  hasMfa: boolean;
  hasAntiPhishing: boolean;
  hasEndpointProtection: boolean;
  hasOffsiteBackups: boolean;
  hasPenetrationTesting: boolean;
  cloudPlatforms: {
    aws: boolean;
    azure: boolean;
    gcp: boolean;
    localHosting: boolean;
    other?: string;
  };
}

export interface IncidentHistory {
  hadIncidents: boolean;
  incidents?: Array<{
    description: string;
    ransomPaid: boolean;
    finesLevied: boolean;
    fineAmount?: number;
  }>;
}

export interface ThirdPartyRisk {
  requiresSecurityStandards: boolean;
  conductsVendorDueDiligence: boolean;
}

export interface CoverageRequirements {
  startDate: string;
  coverageAmount: '1M' | '5M' | '10M+';
  requiresIncidentResponse: boolean;
  requiresBreachRemediation: boolean;
}

export interface OptionalEnhancements {
  certifications: string[];
  hasInsiderThreatDetection: boolean;
  providesSecurityTraining: boolean;
}

export interface RiskProfile {
  organization: OrganizationDetails;
  securityPosture: SecurityPosture;
  incidentHistory: IncidentHistory;
  thirdPartyRisk: ThirdPartyRisk;
  coverageRequirements: CoverageRequirements;
  optionalEnhancements: OptionalEnhancements;
  industryRisk: number;
  securityScore: number;
  coverageLevel: string;
} 