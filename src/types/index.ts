import { Request } from "express";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface AuthUser {
  email: string;
  groups: string[];
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
export interface PriceTier {
  label: string;
  price: number;
}

export interface Service {
  id?: number;
  publicId: string;
  name: string;
  description: string;
  durationDescription?: string | null;
  category: "main" | "extra" | "delivery";
  pricingType: "fixed" | "tiered" | "percentage";
  basePrice?: number | null;
  percentageValue?: number | null;
  priceTiers?: PriceTier[] | null;
  restrictedToService?: string | null;
  sortOrder?: number | null;
  isActive?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrderEntry {
  id?: number;
  publicId: string;
  orderId: number;
  coupleName: string;
  weddingDate: string;
  status: "pending" | "in_progress" | "under_review" | "revision_requested" | "revision_approved" | "completed" | "cancelled";
  adminNotes?: string | null;
  deliveryLink?: string | null;
  previewLink?: string | null;
  userRevisionNotes?: string | null;
  sortOrder?: number;
  // Per-entry service config (redesign ordini)
  selectedServices?: any;
  deliveryMethod?: "cloud_link" | "upload_request" | null;
  materialLink?: string | null;
  materialSizeGb?: number | null;
  cameraCount?: "1-4" | "5-6" | "7+" | null;
  exportFps?: string | null;
  exportBitrate?: string | null;
  exportAspect?: string | null;
  exportResolution?: string | null;
  servicesTotal?: number | null;
  cameraSurcharge?: number | null;
  totalPrice?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Order {
  id?: number;
  publicId: string;
  userEmail: string;
  isBatch?: number;
  coupleName: string;
  weddingDate: string;
  deliveryMethod?: "cloud_link" | "upload_request" | null;
  materialLink?: string | null;
  materialSizeGb?: number | null;
  cameraCount?: "1-4" | "5-6" | "7+" | null;
  generalNotes?: string | null;
  referenceVideo?: string | null;
  exportFps?: string | null;
  exportBitrate?: string | null;
  exportAspect?: string | null;
  exportResolution?: string | null;
  selectedServices?: any;
  servicesTotal?: number | null;
  cameraSurcharge?: number | null;
  totalPrice?: number | null;
  status: "draft" | "pending" | "quote_ready" | "in_progress" | "under_review" | "awaiting_payment" | "completed" | "cancelled";
  adminNotes?: string | null;
  deliveryLink?: string | null;
  invoiceLink?: string | null;
  proposedTotalPrice?: number | null;
  desiredDeliveryDate?: string | null;
  invoiceUrl?: string | null;
  entries?: OrderEntry[];
  entryCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Conversation {
  id?: number;
  publicId: string;
  userEmail: string;
  subject: string;
  orderId?: string | null;
  status: "open" | "closed";
  chatMode: "limited" | "realtime";
  lastMessageAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Message {
  id?: number;
  publicId: string;
  conversationId: number;
  senderRole: "user" | "admin";
  senderEmail?: string | null;
  content: string;
  readAt?: Date | null;
  createdAt?: Date;
}

export interface ConversationWithUnread extends Conversation {
  unreadCount: number;
}
