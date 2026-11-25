export type UserRole = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'inactive';

export type QualificationLevel =
  | 'PhD'
  | 'Sarjana'
  | 'Sarjana Muda'
  | 'Diploma'
  | 'Kelayakan Lain';

export type PublicationType =
  | 'Buku'
  | 'Artikel Jurnal'
  | 'Prosiding'
  | 'Penyelidikan'
  | 'Inovasi'
  | 'Pengiktirafan';

export type CertificateCategory =
  | 'Sijil Akademik'
  | 'Sijil Profesional'
  | 'Sijil Kompetensi'
  | 'Sijil Latihan'
  | 'Sijil Pengiktirafan'
  | 'Dokumen Lain';

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  staffId: string;
  role: UserRole;
  isAdmin: boolean;
  status: AccountStatus;
  centerId: string;
  departmentId: string;
  emailVerified: boolean;
  providers: string[];
  invitationId: string;
  lastLoginAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  fullName: string;
  staffId: string;
  role: UserRole;
  isAdmin: boolean;
  centerId: string;
  departmentId: string;
  status: 'invited' | 'claimed' | 'revoked';
  claimedByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface StaffProfile {
  id: string;
  staffId: string;
  uid: string;
  fullName: string;
  officialEmail: string;
  position: string;
  grade: string;
  scheme: string;
  isLecturer: boolean;
  centerId: string;
  centerName: string;
  departmentId: string;
  departmentName: string;
  unit: string;
  orgPosition: string;
  headOfCenter: string;
  headOfDepartment: string;
  highestQualification: string;
  primaryExpertise: string;
  secondaryExpertise: string;
  digitalCompetencies: string[];
  expertiseKeywords: string[];
  completionPercent: number;
  missingSections: string[];
  hasPhoto: boolean;
  photoDisplayUrl: string;
  certificateCount: number;
  publicationCount: number;
  status: 'active' | 'inactive' | 'draft';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface StaffPrivatePII {
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  phone: string;
  gender: string;
  icNumber: string;
  altContact: string;
  appointmentDate: string;
  serviceStatus: string;
  yearsOfService: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface OrganizationCenter {
  id: string;
  code: string;
  name: string;
  headName: string;
  headUid: string;
  location: string;
  status: 'active' | 'inactive';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface Department {
  id: string;
  centerId: string;
  code: string;
  name: string;
  headName: string;
  headUid: string;
  status: 'active' | 'inactive';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface Qualification {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  level: QualificationLevel;
  institution: string;
  fieldOfStudy: string;
  graduationYear: string;
  notes: string;
  status: 'active' | 'archived';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface ExpertiseRecord {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  primaryExpertise: string;
  secondaryExpertise: string;
  specializations: string[];
  researchAreas: string[];
  teachingAreas: string[];
  trainingAreas: string[];
  keywords: string[];
  teachingExp: string;
  managementExp: string;
  facilitatorExp: string;
  speakerExp: string;
  coachExp: string;
  projectExp: string;
  professionalExp: string;
  status: 'active' | 'draft';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface CompetencyItem {
  categoryId: string;
  categoryName: string;
  level: 'Asas' | 'Pertengahan' | 'Lanjutan' | 'Pakar';
  years: number;
  notes: string;
}

export interface CompetencyRecord {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  items: CompetencyItem[];
  status: 'active' | 'draft';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface Publication {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  type: PublicationType;
  title: string;
  publisherOrVenue: string;
  year: string;
  url: string;
  description: string;
  status: 'active' | 'archived';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface Certificate {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  title: string;
  category: CertificateCategory;
  certificateDate: string;
  driveFileId: string;
  driveFolderId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  status: 'active' | 'replaced' | 'deleted' | 'orphan_pending';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface ProfilePhoto {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  originalDriveFileId: string;
  displayDriveFileId: string;
  originalFileName: string;
  displayFileName: string;
  cropX: number;
  cropY: number;
  zoom: number;
  alignX: 'left' | 'center' | 'right';
  alignY: 'top' | 'center' | 'bottom';
  aspectRatio: '1:1';
  mimeType: string;
  fileSize: number;
  status: 'active' | 'replaced' | 'deleted';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface DriveSetting {
  id: string;
  status: 'connected' | 'disconnected' | 'error' | 'pending_configuration';
  connectedEmail: string;
  rootFolderId: string;
  folderIds: Record<string, string>;
  lastConnectedAt: string;
  lastUploadAt: string;
  uploadedDocumentsCount: number;
  uploadedPhotosCount: number;
  maxPhotoSizeMb: number;
  maxCertSizeMb: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  staffId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  outcome: 'success' | 'failure';
  details: string;
  createdAt?: unknown;
}

export interface GeneratedProfile {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  templateType: 'ringkas' | 'lengkap';
  dataVersion: string;
  driveFileId: string;
  fileName: string;
  status: 'generated' | 'stored_in_drive';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface SystemSetting {
  id: string;
  systemName: string;
  institutionName: string;
  expertiseCategories: string[];
  competencyCategories: string[];
  status: 'active';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export type AppRoute =
  | 'welcome'
  | 'login'
  | 'profile'
  | 'center-dashboard'
  | 'department-dashboard'
  | 'expertise-directory'
  | 'professional-pdf'
  | 'capacity-analysis'
  | 'admin';
