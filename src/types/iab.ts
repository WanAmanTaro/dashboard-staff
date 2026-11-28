export type UserRole = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

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
  | 'Modul'
  | 'Sumber Rujukan'
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
  role?: UserRole;
  fullName: string;
  officialEmail: string;
  position: string;
  grade: string;
  kupGrade?: string;
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

export type CompetencySkillType = 'aplikasi' | 'pengetahuan';

export interface CompetencyItem {
  categoryId: string;
  categoryName: string;
  skillType?: CompetencySkillType;
  level: 'Asas' | 'Pertengahan' | 'Lanjutan' | 'Pakar';
  years: number;
  notes: string;
  hasCertificate?: boolean;
  certificateId?: string;
  certificateTitle?: string;
  certificateDriveFileId?: string;
  hasValidityPeriod?: boolean;
  certificateStartDate?: string;
  certificateEndDate?: string;
  certificateValidityDuration?: string;
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

export type IabCertKey =
  | 'certifiedCoach'
  | 'certifiedMasterCoach'
  | 'certifiedTrainer'
  | 'certifiedMasterTrainer'
  | 'certifiedAccessor'
  | 'konsultanIab';

export type IabCertStatus = 'Ada' | 'Tiada';

export interface IabCertItem {
  key: IabCertKey;
  label: string;
  status: IabCertStatus;
  passYear: string;
}

export type IabModuleContributionRole =
  | 'KETUA PAKAR RUJUK (KPR)'
  | 'PAKAR RUJUK UTAMA (PRU)'
  | 'Ahli';

export interface IabModuleContribution {
  id: string;
  moduleName: string;
  year: string;
  contribution: IabModuleContributionRole;
  activeStatus: 'Aktif' | 'Tidak Aktif';
}

export interface IabCompetencyRecord {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  certifications: IabCertItem[];
  modules: IabModuleContribution[];
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
  achievement?: string;
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
  applicationSkillCategories?: string[];
  knowledgeSkillCategories?: string[];
  institutionCategories?: string[];
  publicationYears?: string[];
  iabModules?: string[];
  status: 'active';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export interface TrainingRecord {
  id: string;
  moduleName: string;
  role: string;
  year: string;
}

export interface ProgramManagementRecord {
  id: string;
  programName: string;
  centerId: string;
  centerName: string;
  departmentId: string;
  departmentName: string;
  role: string;
  year: string;
}

export interface ConsultationRecord {
  id: string;
  title: string;
  organization: string;
  consultationType: string;
  role: string;
  year: string;
  impact: string;
}

export interface NpqelSupervisionRecord {
  id: string;
  participantName: string;
  participantClass: string;
  year: string;
}

export interface ProgramEvaluationRecord {
  id: string;
  programName: string;
  centerId: string;
  centerName: string;
  departmentId: string;
  departmentName: string;
  role: string;
  year: string;
  score: number;
}

export interface ThinkTankRecord {
  id: string;
  committeeName: string;
  level: string;
  role: string;
  focusArea: string;
  year: string;
  activeStatus: 'Aktif' | 'Tamat';
}

export interface StaffFunctionsRecord {
  id: string;
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  trainings: TrainingRecord[];
  programManagements: ProgramManagementRecord[];
  consultations: ConsultationRecord[];
  npqelSupervisions: NpqelSupervisionRecord[];
  programEvaluations: ProgramEvaluationRecord[];
  thinkTankEntries: ThinkTankRecord[];
  status: 'active' | 'draft';
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy: string;
  updatedBy: string;
}

export type AppRoute =
  | 'welcome'
  | 'login'
  | 'profile'
  | 'academic-qualifications'
  | 'teaching-experience'
  | 'fungsi-latihan'
  | 'fungsi-konsultasi'
  | 'fungsi-penyelidikan'
  | 'fungsi-penerbitan'
  | 'fungsi-pentaksiran'
  | 'fungsi-pemikir'
  | 'kompetensi-iab'
  | 'digital-competencies'
  | 'center-dashboard'
  | 'department-dashboard'
  | 'expertise-directory'
  | 'professional-pdf'
  | 'capacity-analysis'
  | 'admin';
