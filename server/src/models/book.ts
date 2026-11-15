import mongoose, { Schema, Types, model } from 'mongoose';

export interface BookDocument {
  _id: Types.ObjectId;
  title: string;
  subtitle?: string | null;
  authors: string[];
  isbn: string;
  publisher?: string | null;
  publishedYear?: number | null;
  language: string;
  pages?: number | null;
  subjects: string[];
  description?: string | null;
  coverUrl?: string | null;
  ratingAvg: number;
  ratingCount: number;
  status: 'ACTIVE' | 'ARCHIVED';
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const bookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    authors: { type: [String], default: [] },
    isbn: { type: String, required: true, unique: true, trim: true },
    publisher: { type: String, trim: true },
    publishedYear: { type: Number },
    language: { type: String, default: 'en', trim: true },
    pages: { type: Number },
    subjects: { type: [String], default: [] },
    description: { type: String },
    coverUrl: { type: String },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
    createdBy: { type: String },
  },
  { timestamps: true },
);

bookSchema.index({ status: 1, createdAt: -1 });
bookSchema.index({ subjects: 1 });

export const Book = model<BookDocument>('Book', bookSchema);

export function isValidBookId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}
