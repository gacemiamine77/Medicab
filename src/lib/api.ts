export interface Patient {
  id: number;
  first_name: string;
  last_name: string;
  nin?: string; // National Identification Number
  gender: string;
  birth_date: string;
  age?: number;
  blood_group: string;
  photo?: string;
  phone: string;
  phone_secondary?: string;
  email?: string;
  address?: string;
  city?: string;
  wilaya?: string;
  profession?: string;
  nss?: string;
  insurance?: string;
  mutuelle?: string;
  emergency_contact?: string;
  medical_history?: {
    medical?: string;
    surgical?: string;
    family?: string;
    allergies?: string;
    chronic_treatments?: string;
    hospitalizations?: string;
    medication_restrictions?: MedicationRestriction[];
  };
  created_at: string;
  doctor_id?: number;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
  form?: string;
  libraryId?: number;
  severity?: string;
}

export interface MedicationLibrary {
  id: number;
  name: string;
  dosage?: string;
  unit?: string;
  packaging?: string;
  dci?: string;
  form?: string;
  abbreviation?: string;
  posology?: string;
  classe?: string;
  created_at: string;
}

export interface MedicationRestriction {
  type: 'allergy' | 'intolerance' | 'class' | 'contraindication';
  medicationName: string;
  medicationId?: number;
  notes?: string;
}

export interface DciInteraction {
  id: number;
  dci1: string;
  dci2: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface SimpleListItem {
  id: number;
  name: string;
  created_at: string;
}

export interface ParaclinicalExam {
  id: number;
  name: string;
  type: string;
  created_at: string;
}

export interface SharePermission {
  id: number;
  patient_id: number;
  doctor_id: number;
  shared_by_id: number;
  can_view_medical_history: boolean;
  can_view_consultations: boolean;
  can_view_exams: boolean;
  can_view_reports: boolean;
  can_view_documents: boolean;
  doctor_full_name?: string;
  specialty?: string;
  clinic_name?: string;
}

export interface Consultation {
  id: number;
  patient_id: number;
  doctor_id?: number;
  doctor_name?: string;
  date: string;
  hour: string;
  reason: string;
  symptoms: string;
  diagnosis: string;
  temperature?: number;
  bp?: string;
  weight?: number;
  height?: number;
  imc?: number;
  saturation?: number;
  glycemia?: number;
  notes?: string;
  fee?: number;
  medications?: Medication[];
  prescription_code?: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  first_name?: string;
  last_name?: string;
  date: string;
  hour: string;
  reason: string;
  duration: number;
  status: string;
  doctor_id?: number;
  booking_reference?: string;
  patient_name?: string;
  patient_phone?: string;
  patient_email?: string;
  cancellation_reason?: string;
  doctor_notes?: string;
  rescheduled_to_date?: string;
  rescheduled_to_hour?: string;
  source?: string;
  doctor_name?: string;
  clinic_name?: string;
  address?: string;
  city?: string;
  doctor_phone?: string;
  specialty?: string;
}

export interface MedicalExam {
  id: number;
  patient_id: number;
  doctor_id?: number;
  doctor_name?: string;
  type: string;
  sub_type: string;
  date: string;
  provider?: string;
  indication?: string;
  result?: string;
  notes?: string;
  attachments?: any;
  created_at: string;
}

export interface LabRequest {
  id: number;
  patient_id: number;
  requested_by_id: number;
  lab_id?: number;
  imaging_center_id?: number;
  exam_category?: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_age?: number;
  requested_analyses: any[];
  report_pdf?: string;
  report_text?: string;
  status: 'requested' | 'completed';
  created_at: string;
  completed_at?: string;
}

export interface MedicalMessage {
  id: number;
  sender_id: number;
  recipient_id: number;
  patient_id?: number;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
  recipient_name?: string;
}

export interface MedicalReport {
  id: number;
  patient_id: number;
  doctor_id?: number;
  doctor_name?: string;
  type: string;
  date: string;
  content: string;
  data: any;
  created_at: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'doctor' | 'pharmacist' | 'secretary' | 'laboratory' | 'imaging_center' | 'admin';
  specialty?: string;
  account_number?: string;
  national_number?: string;
  clinic_name?: string;
  address?: string;
  city?: string;
  register_number?: string;
  phone?: string;
  subscription_type?: string;
  subscription_status?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  created_at: string;
}

export interface Prescription {
  id: number;
  consultation_id?: number;
  patient_id: number;
  doctor_id: number;
  pharmacist_id?: number;
  prescription_code?: string;
  sequential_number?: number;
  status: 'pending' | 'dispensed';
  data: any;
  created_at: string;
  dispensed_at?: string;
  dispensed_data?: any[];
  first_name?: string; // from join
  last_name?: string;  // from join
  doctor_name?: string; // from join
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  data: any;
  is_read: boolean;
  created_at: string;
}

async function handleResponse(res: Response, defaultError: string) {
  if (!res.ok) {
    try {
      const errorData = await res.json();
      throw new Error(errorData.error || defaultError);
    } catch (e) {
      if (e instanceof Error && e.message !== defaultError) throw e;
      throw new Error(defaultError);
    }
  }
  return res.json();
}

function getHeaders() {
  const token = localStorage.getItem("medicab_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
}

export const api = {
  // Auth
  login: async (credentials: any): Promise<{ user: User, token: string }> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    return handleResponse(res, "Failed to login");
  },

  adminCreateUser: async (data: any, managementKey: string): Promise<any> => {
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-management-key": managementKey
      },
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to create user");
  },
  
  adminGetUsers: async (managementKey: string): Promise<User[]> => {
    const res = await fetch("/api/admin/users", {
      headers: { 
        "x-management-key": managementKey
      }
    });
    return handleResponse(res, "Failed to fetch users");
  },


  getLaboratories: async (): Promise<any[]> => {
    const res = await fetch("/api/laboratories", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch laboratories");
  },

  getImagingCenters: async (): Promise<any[]> => {
    const res = await fetch("/api/imaging-centers", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch imaging centers");
  },

  getLabRequests: async (): Promise<LabRequest[]> => {
    const res = await fetch("/api/lab-requests", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch lab requests");
  },

  createLabRequest: async (data: any): Promise<LabRequest> => {
    const res = await fetch("/api/lab-requests", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to create lab request");
  },

  refuseLabRequest: async (id: number, reason: string): Promise<LabRequest> => {
    const res = await fetch(`/api/lab-requests/${id}/refuse`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ reason }),
    });
    return handleResponse(res, "Failed to refuse lab request");
  },

  completeLabRequest: async (id: number, data: { report_pdf?: string; report_text?: string }): Promise<LabRequest> => {
    const res = await fetch(`/api/lab-requests/${id}/complete`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to complete lab request");
  },

  updateLabReport: async (id: number, data: { report_pdf?: string; report_text?: string; indication?: string; provider?: string; result?: string; notes?: string }): Promise<LabRequest> => {
    const res = await fetch(`/api/lab-requests/${id}/report`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to update lab report");
  },

  deleteLabReport: async (id: number, index: number): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/lab-requests/${id}/report/${index}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to delete lab report");
  },

  uploadLabData: async (url: string, data: any, onProgress?: (pct: number) => void): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);
      const token = localStorage.getItem("medicab_token");
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 70) + 30);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve(xhr.responseText); }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error || "Upload failed"));
          } catch { reject(new Error("Upload failed")); }
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(JSON.stringify(data));
    });
  },

  getMedicalMessages: async (): Promise<MedicalMessage[]> => {
    const res = await fetch("/api/medical-messages", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch medical messages");
  },

  sendMedicalMessage: async (data: any): Promise<MedicalMessage> => {
    const res = await fetch("/api/medical-messages", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to send medical message");
  },

  getPatientMessages: async (patientId: number): Promise<MedicalMessage[]> => {
    const res = await fetch(`/api/patients/${patientId}/messages`, { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch patient messages");
  },

  markMessageRead: async (messageId: number): Promise<any> => {
    const res = await fetch(`/api/medical-messages/${messageId}/read`, {
      method: "PUT",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to mark message as read");
  },

  getMe: async (): Promise<User> => {
    const res = await fetch("/api/auth/me", {
      headers: getHeaders()
    });
    return handleResponse(res, "Failed to fetch profile");
  },

  getPatients: async (): Promise<Patient[]> => {
    const res = await fetch("/api/patients", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch patients");
  },
  
  getPatient: async (id: number): Promise<Patient & { consultations: Consultation[], appointments: Appointment[], exams: MedicalExam[], reports: MedicalReport[] }> => {
    const res = await fetch(`/api/patients/${id}`, { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch patient");
  },
  
  createPatient: async (patient: Partial<Patient>): Promise<Patient> => {
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(patient),
    });
    return handleResponse(res, "Failed to create patient");
  },

  updatePatient: async (id: number, patient: Partial<Patient>): Promise<Patient> => {
    const res = await fetch(`/api/patients/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(patient),
    });
    return handleResponse(res, "Failed to update patient");
  },
  
  createConsultation: async (consultation: Partial<Consultation>): Promise<Consultation> => {
    const res = await fetch("/api/consultations", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(consultation),
    });
    return handleResponse(res, "Failed to create consultation");
  },

  updateConsultation: async (id: number, consultation: Partial<Consultation>): Promise<Consultation> => {
    const res = await fetch(`/api/consultations/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(consultation),
    });
    return handleResponse(res, "Failed to update consultation");
  },
  
  deleteConsultation: async (id: number): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/consultations/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to delete consultation");
  },

  updateAppointment: async (id: number, data: Partial<Appointment>): Promise<Appointment> => {
    const res = await fetch(`/api/appointments/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to update appointment");
  },

  deleteAppointment: async (id: number): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/appointments/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to delete appointment");
  },

  confirmAppointment: async (id: number): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/appointments/${id}/confirm`, {
      method: "PUT",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to confirm appointment");
  },

  refuseAppointment: async (id: number, reason?: string): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/appointments/${id}/refuse`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ reason }),
    });
    return handleResponse(res, "Failed to refuse appointment");
  },

  rescheduleAppointment: async (id: number, new_date: string, new_hour: string, reason?: string): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/appointments/${id}/reschedule`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ new_date, new_hour, reason }),
    });
    return handleResponse(res, "Failed to reschedule appointment");
  },

  getWorkingHours: async (): Promise<any[]> => {
    const res = await fetch("/api/working-hours", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch working hours");
  },

  setWorkingHours: async (hours: { day_of_week: number; start_time: string; end_time: string; is_available: boolean }[]): Promise<{ success: boolean }> => {
    const res = await fetch("/api/working-hours", {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ hours }),
    });
    return handleResponse(res, "Failed to set working hours");
  },

  deletePatient: async (id: number): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/patients/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to delete patient");
  },

  importPatients: async (patients: any[]): Promise<{ message: string }> => {
    const res = await fetch("/api/patients/import", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(patients),
    });
    return handleResponse(res, "Failed to import patients");
  },

  exportPatients: async (): Promise<any[]> => {
    const res = await fetch("/api/patients/export", { headers: getHeaders() });
    return handleResponse(res, "Failed to export patients");
  },

  forgotPassword: async (email: string): Promise<{ success: boolean, message: string }> => {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return handleResponse(res, "Failed to send reset email");
  },

  resetPassword: async (token: string, password: string): Promise<{ success: boolean, message: string }> => {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    return handleResponse(res, "Failed to reset password");
  },

  getAppointments: async (): Promise<Appointment[]> => {
    const res = await fetch("/api/appointments", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch appointments");
  },
  
  createAppointment: async (appointment: Partial<Appointment>): Promise<Appointment> => {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(appointment),
    });
    return handleResponse(res, "Failed to create appointment");
  },

  createMedicalExam: async (exam: Partial<MedicalExam>): Promise<MedicalExam> => {
    const res = await fetch("/api/medical_exams", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(exam),
    });
    return handleResponse(res, "Failed to create medical exam");
  },

  updateMedicalExam: async (id: number, exam: Partial<MedicalExam>): Promise<MedicalExam> => {
    const res = await fetch(`/api/medical_exams/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(exam),
    });
    return handleResponse(res, "Failed to update medical exam");
  },

  deleteMedicalExam: async (id: number): Promise<any> => {
    const res = await fetch(`/api/medical_exams/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to delete medical exam");
  },

  deleteLabRequest: async (id: number): Promise<any> => {
    const res = await fetch(`/api/lab-requests/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to delete lab request");
  },

  createMedicalReport: async (report: Partial<MedicalReport>): Promise<MedicalReport> => {
    const res = await fetch("/api/medical_reports", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(report),
    });
    return handleResponse(res, "Failed to create medical report");
  },
  
  getDashboardStats: async () => {
    const res = await fetch("/api/dashboard/stats", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch statistics");
  },

  getMedicationsLibrary: async (): Promise<MedicationLibrary[]> => {
    const res = await fetch("/api/medications", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch medications library");
  },

  getPharmacistPrescriptions: async (): Promise<Prescription[]> => {
    const res = await fetch("/api/prescriptions/pharmacist", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch prescriptions");
  },

  dispensePrescription: async (id: number, dispensedItems?: any[]): Promise<Prescription> => {
    const res = await fetch(`/api/prescriptions/${id}/dispense`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ dispensed_items: dispensedItems }),
    });
    return handleResponse(res, "Failed to dispense prescription");
  },

  createPrescription: async (data: any): Promise<Prescription> => {
    const res = await fetch("/api/prescriptions", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to create prescription");
  },

  searchPrescription: async (code: string): Promise<Prescription> => {
    const res = await fetch(`/api/prescriptions/search/${code}`, { 
      headers: getHeaders() 
    });
    return handleResponse(res, "Ordonnance non trouvée");
  },

  getPatientPrescriptions: async (patientId: number): Promise<Prescription[]> => {
    const res = await fetch(`/api/prescriptions/patient/${patientId}`, { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch patient prescriptions");
  },

  createMedicationLibrary: async (med: Partial<MedicationLibrary>): Promise<MedicationLibrary> => {
    const res = await fetch("/api/medications", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(med),
    });
    return handleResponse(res, "Failed to create medication");
  },

  importMedicationsBulk: async (meds: Partial<MedicationLibrary>[]): Promise<{ message: string }> => {
    const res = await fetch("/api/medications/bulk", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(meds),
    });
    return handleResponse(res, "Failed to bulk import medications");
  },

  deleteMedicationLibrary: async (id: number): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/medications/${id}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    return handleResponse(res, "Failed to delete medication");
  },

  resetMedicationLibrary: async (): Promise<{ success: boolean }> => {
    const res = await fetch("/api/medications/reset", { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to reset medications");
  },

  getDciInteractions: async (): Promise<DciInteraction[]> => {
    const res = await fetch("/api/dci-interactions", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch DCI interactions");
  },

  createDciInteraction: async (data: { dci1: string; dci2: string; severity: string; description: string }): Promise<DciInteraction> => {
    const res = await fetch("/api/dci-interactions", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to create DCI interaction");
  },

  deleteDciInteraction: async (id: number): Promise<{ success: boolean }> => {
    const res = await fetch(`/api/dci-interactions/${id}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    return handleResponse(res, "Failed to delete DCI interaction");
  },

  checkDciInteractions: async (dcis: string[]): Promise<DciInteraction[]> => {
    const res = await fetch("/api/dci-interactions/check", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ dcis }),
    });
    return handleResponse(res, "Failed to check DCI interactions");
  },

  getLabAnalyses: async (): Promise<SimpleListItem[]> => {
    const res = await fetch("/api/lab-analyses", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch lab analyses");
  },
  createLabAnalysis: async (name: string): Promise<SimpleListItem> => {
    const res = await fetch("/api/lab-analyses", { method: "POST", headers: getHeaders(), body: JSON.stringify({ name }) });
    return handleResponse(res, "Failed to create lab analysis");
  },
  deleteLabAnalysis: async (id: number): Promise<any> => {
    const res = await fetch(`/api/lab-analyses/${id}`, { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to delete lab analysis");
  },
  resetLabAnalyses: async (): Promise<{ success: boolean }> => {
    const res = await fetch("/api/lab-analyses/reset", { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to reset lab analyses");
  },

  getConsultationMotifs: async (): Promise<SimpleListItem[]> => {
    const res = await fetch("/api/consultation-motifs", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch consultation motifs");
  },
  createConsultationMotif: async (name: string): Promise<SimpleListItem> => {
    const res = await fetch("/api/consultation-motifs", { method: "POST", headers: getHeaders(), body: JSON.stringify({ name }) });
    return handleResponse(res, "Failed to create consultation motif");
  },
  deleteConsultationMotif: async (id: number): Promise<any> => {
    const res = await fetch(`/api/consultation-motifs/${id}`, { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to delete consultation motif");
  },
  resetConsultationMotifs: async (): Promise<{ success: boolean }> => {
    const res = await fetch("/api/consultation-motifs/reset", { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to reset consultation motifs");
  },

  getDiagnoses: async (): Promise<SimpleListItem[]> => {
    const res = await fetch("/api/diagnoses", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch diagnoses");
  },
  createDiagnosis: async (name: string): Promise<SimpleListItem> => {
    const res = await fetch("/api/diagnoses", { method: "POST", headers: getHeaders(), body: JSON.stringify({ name }) });
    return handleResponse(res, "Failed to create diagnosis");
  },
  deleteDiagnosis: async (id: number): Promise<any> => {
    const res = await fetch(`/api/diagnoses/${id}`, { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to delete diagnosis");
  },
  resetDiagnoses: async (): Promise<{ success: boolean }> => {
    const res = await fetch("/api/diagnoses/reset", { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to reset diagnoses");
  },

  getParaclinicalExams: async (): Promise<ParaclinicalExam[]> => {
    const res = await fetch("/api/paraclinical-exams", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch paraclinical exams");
  },

  createParaclinicalExam: async (name: string, type?: string): Promise<ParaclinicalExam> => {
    const res = await fetch("/api/paraclinical-exams", { method: "POST", headers: getHeaders(), body: JSON.stringify({ name, type }) });
    return handleResponse(res, "Failed to create paraclinical exam");
  },

  deleteParaclinicalExam: async (id: number): Promise<any> => {
    const res = await fetch(`/api/paraclinical-exams/${id}`, { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to delete paraclinical exam");
  },
  resetParaclinicalExams: async (): Promise<{ success: boolean }> => {
    const res = await fetch("/api/paraclinical-exams/reset", { method: "DELETE", headers: getHeaders() });
    return handleResponse(res, "Failed to reset paraclinical exams");
  },

  getNotifications: async (): Promise<Notification[]> => {
    const res = await fetch("/api/notifications", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch notifications");
  },

  markNotificationRead: async (id: number): Promise<any> => {
    const res = await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: getHeaders() });
    return handleResponse(res, "Failed to mark notification as read");
  },

  markAllNotificationsRead: async (): Promise<any> => {
    const res = await fetch("/api/notifications/read-all", { method: "POST", headers: getHeaders() });
    return handleResponse(res, "Failed to mark all notifications as read");
  },

  getDoctors: async (): Promise<User[]> => {
    const res = await fetch("/api/doctors", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch doctors");
  },

  getSecretaryLinks: async (): Promise<any[]> => {
    const res = await fetch("/api/secretary-links", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch secretary links");
  },

  getAdminSecretaryLinks: async (secretaryId: number): Promise<any[]> => {
    const res = await fetch(`/api/admin/secretary-links/${secretaryId}`, { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch secretary links");
  },

  addSecretaryLink: async (secretaryId: number, doctorId: number): Promise<any> => {
    const res = await fetch(`/api/admin/secretary-links/${secretaryId}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ doctor_id: doctorId }),
    });
    return handleResponse(res, "Failed to add secretary link");
  },

  removeSecretaryLink: async (secretaryId: number, doctorId: number): Promise<any> => {
    const res = await fetch(`/api/admin/secretary-links/${secretaryId}/${doctorId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to remove secretary link");
  },

  adminUpdateUser: async (id: number, data: any, managementKey: string): Promise<any> => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-management-key": managementKey
      },
      body: JSON.stringify(data),
    });
    return handleResponse(res, "Failed to update user");
  },

  sharePatient: async (patientId: number, doctorId: number, permissions?: Partial<SharePermission>, priority?: string, reason?: string): Promise<any> => {
    const res = await fetch(`/api/patients/${patientId}/share`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ doctor_id: doctorId, permissions, priority, reason })
    });
    return handleResponse(res, "Failed to share patient");
  },

  unsharePatient: async (patientId: number, doctorId: number): Promise<any> => {
    const res = await fetch(`/api/patients/${patientId}/share/${doctorId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    return handleResponse(res, "Failed to unshare patient");
  },

  transferPatient: async (patientId: number, doctorId: number, force?: boolean): Promise<any> => {
    const res = await fetch(`/api/patients/${patientId}/transfer/${doctorId}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ force }),
    });
    return handleResponse(res, "Failed to transfer patient");
  },

  updateSharePermission: async (patientId: number, doctorId: number, permissions: Partial<SharePermission>): Promise<any> => {
    const res = await fetch(`/api/patients/${patientId}/share-permissions`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ doctor_id: doctorId, permissions })
    });
    return handleResponse(res, "Failed to update share permissions");
  },

  getSharedWith: async (patientId: number): Promise<User[]> => {
    const res = await fetch(`/api/patients/${patientId}/shared-with`, { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch sharing info");
  },

  getTransferredDoctors: async (patientId: number): Promise<any[]> => {
    const res = await fetch(`/api/patients/${patientId}/transferred`, { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch transferred doctors");
  },

  getSharePermissions: async (patientId: number): Promise<SharePermission[]> => {
    const res = await fetch(`/api/patients/${patientId}/share-permissions`, { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch share permissions");
  },

  getDoctorsDirectory: async (params?: { q?: string; wilaya?: string; city?: string; specialty?: string; role?: string }): Promise<any[]> => {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.wilaya) query.set('wilaya', params.wilaya);
    if (params?.city) query.set('city', params.city);
    if (params?.specialty) query.set('specialty', params.specialty);
    if (params?.role) query.set('role', params.role);
    const qs = query.toString();
    const res = await fetch(`/api/doctors/directory${qs ? '?' + qs : ''}`, { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch doctors directory");
  },

  getSpecialties: async (): Promise<string[]> => {
    const res = await fetch("/api/specialties", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch specialties");
  },

  uploadFile: async (file: File): Promise<{ url: string, filename: string, size: number }> => {
    const token = localStorage.getItem("medicab_token");
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
      body: formData,
    });
    return handleResponse(res, "Failed to upload file");
  },

  uploadMultipleFiles: async (files: File[]): Promise<{ files: { url: string, filename: string, size: number }[] }> => {
    const token = localStorage.getItem("medicab_token");
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    const res = await fetch("/api/upload/multiple", {
      method: "POST",
      headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
      body: formData,
    });
    return handleResponse(res, "Failed to upload files");
  },

  getUserSettings: async (): Promise<any> => {
    const res = await fetch("/api/user-settings", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch user settings");
  },

  saveUserSettings: async (settings: any): Promise<{ success: boolean }> => {
    const res = await fetch("/api/user-settings", {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(settings),
    });
    return handleResponse(res, "Failed to save user settings");
  },

  getPrescriptionTemplates: async (): Promise<any[]> => {
    const res = await fetch("/api/prescription-templates", { headers: getHeaders() });
    return handleResponse(res, "Failed to fetch prescription templates");
  },

  createPrescriptionTemplate: async (name: string, medications: any[]): Promise<any> => {
    const res = await fetch("/api/prescription-templates", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ name, medications })
    });
    return handleResponse(res, "Failed to create prescription template");
  },

  deletePrescriptionTemplate: async (id: number): Promise<any> => {
    const res = await fetch(`/api/prescription-templates/${id}`, {
      method: "DELETE",
      headers: getHeaders()
    });
    return handleResponse(res, "Failed to delete prescription template");
  },
};
