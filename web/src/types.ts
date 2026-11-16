export type Role = 'ADMIN' | 'LIBRARIAN' | 'MEMBER';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type LoanStatus = 'ACTIVE' | 'RETURNED' | 'LOST';
export type ReservationStatus = 'QUEUED' | 'READY' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
export type FineStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED';

export interface MemberProfile {
  id: string;
  membershipNo: string;
  status: MemberStatus;
  maxLoans: number;
  expiresAt: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  member?: MemberProfile | null;
}

export interface BookMeta {
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  isbn?: string;
}

export interface Book extends BookMeta {
  subtitle: string | null;
  isbn: string;
  publisher: string | null;
  publishedYear: number | null;
  language: string;
  pages: number | null;
  subjects: string[];
  description: string | null;
  ratingAvg: number;
  ratingCount: number;
  totalCopies: number;
  availableCopies: number;
  copiesByStatus: Record<string, number>;
  createdAt: string;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchResponse {
  items: Book[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    subjects: FacetBucket[];
    languages: FacetBucket[];
    publishers: FacetBucket[];
  };
}

export interface Payment {
  id: string;
  amount: number;
  method: 'CASH' | 'CARD' | 'ONLINE';
  reference: string | null;
  paidAt: string;
  receivedBy?: { name: string } | null;
}

export interface Loan {
  id: string;
  copyId: string;
  bookId: string;
  memberId: string;
  checkedOutAt: string;
  dueAt: string;
  returnedAt: string | null;
  renewedCount: number;
  status: LoanStatus;
  fineAmount: number;
  copy?: { copyCode: string } | null;
  issuedBy?: { name: string } | null;
  book: BookMeta | null;
  overdue: boolean;
  projectedFineCents: number;
  member?: {
    id: string;
    membershipNo: string;
    user: { name: string; email: string };
  } | null;
}

export interface Fine {
  id: string;
  loanId: string;
  memberId: string;
  amount: number;
  paidAmount: number;
  remainingCents: number;
  reason: 'OVERDUE' | 'LOST_ITEM' | 'DAMAGE';
  status: FineStatus;
  note: string | null;
  assessedAt: string;
  paidAt: string | null;
  payments: Payment[];
  loan?: {
    id?: string;
    bookId: string;
    dueAt: string;
    returnedAt?: string | null;
    copy?: { copyCode: string } | null;
  } | null;
  member?: {
    membershipNo: string;
    user: { name: string; email: string };
  } | null;
}

export interface Reservation {
  id: string;
  bookId: string;
  memberId: string;
  status: ReservationStatus;
  position: number | null;
  readyAt: string | null;
  expiresAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  book: BookMeta | null;
  copy?: { copyCode: string } | null;
  member?: {
    membershipNo: string;
    user: { name: string; email: string };
  } | null;
}

export interface MemberSummary extends MemberProfile {
  phone: string | null;
  address: string | null;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    status: string;
  };
}

export interface MemberDesk {
  member: MemberSummary;
  activeLoans: Loan[];
  history: Loan[];
  reservations: Reservation[];
  fines: Fine[];
  outstandingFineCents: number;
  unreadNotifications?: number;
}

export interface MemberListItem extends MemberSummary {
  activeLoanCount: number;
  openFineCount: number;
}

export interface LoanListResponse {
  items: Loan[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemberListResponse {
  items: MemberListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReturnResult {
  loan: Loan;
  fineCents: number;
  fineId: string | null;
  promotedReservationId: string | null;
}

export interface AuditResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReservationListResponse {
  items: Reservation[];
}

export interface FineListResponse {
  items: Fine[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  memberName: string;
  verifiedBorrow: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: 'HOLD_READY' | 'DUE_SOON' | 'OVERDUE' | 'FINE' | 'PAYMENT' | 'SYSTEM';
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export interface ReportData {
  rangeDays: number;
  generatedAt: string;
  kpis: {
    members: number;
    activeMembers: number;
    activeLoans: number;
    overdueLoans: number;
    readyHolds: number;
    queuedHolds: number;
    outstandingFineCents: number;
    collectedFineCents: number;
  };
  circulationByDay: { day: string; count: number }[];
  revenueByDay: { day: string; cents: number }[];
  overdueAging: { bucket: string; count: number }[];
  topBooks: { bookId: string; loans: number; book: BookMeta | null }[];
  finesByStatus: {
    status: FineStatus;
    count: number;
    amountCents: number;
    paidCents: number;
  }[];
}

export interface ActivityItem {
  id: string;
  action: string;
  actor: string;
  actorRole: string | null;
  message: string;
  detail: string | null;
  tone: 'green' | 'amber' | 'red' | 'blue' | 'stone' | 'violet';
  createdAt: string;
}

export interface ActivityResponse {
  items: ActivityItem[];
  generatedAt: string;
}

export interface AuditEntry {
  _id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  memberName: string | null;
  membershipNo: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}
