import { Schema, Types, model } from 'mongoose';

export interface ReviewDocument {
  _id: Types.ObjectId;
  bookId: string;
  userId: string;
  memberName: string;
  rating: number;
  title?: string | null;
  body: string;
  verifiedBorrow: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema(
  {
    bookId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    memberName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true },
    body: { type: String, required: true, trim: true },
    verifiedBorrow: { type: Boolean, default: false },
  },
  { timestamps: true },
);

reviewSchema.index({ bookId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ bookId: 1, createdAt: -1 });

export const Review = model<ReviewDocument>('Review', reviewSchema);
