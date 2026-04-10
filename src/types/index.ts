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
export interface Service {
  id?: number;
  publicId: string;
  name: string;
  description: string;
  durationDescription?: string | null;
  minDuration?: number | null;
  maxDuration?: number | null;
  orientation: "vertical" | "horizontal" | "both";
  priceVertical?: number | null;
  priceHorizontal?: number | null;
  priceBoth?: number | null;
  additionalOptions?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Order {
  id?: number;
  publicId: string;
  userEmail: string;
  coupleName: string;
  weddingDate: string;
  deliveryMethod: "cloud_link" | "upload_request";
  materialLink?: string | null;
  materialSizeGb: number;
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
  status: "pending" | "in_progress" | "completed" | "cancelled";
  adminNotes?: string | null;
  deliveryLink?: string | null;
  desiredDeliveryDate?: string | null;
  invoiceUrl?: string | null;
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
