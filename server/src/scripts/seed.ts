import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { connectMongo, disconnectMongo } from '../lib/mongo';
import { Book, type BookDocument } from '../models/book';
import { Review } from '../models/review';
import { Notification } from '../models/notification';
import { addDays, addHours } from '../lib/time';
import { createCopies } from '../services/books';
import { logger } from '../lib/logger';

interface BookSpec {
  title: string;
  authors: string[];
  isbn: string;
  publisher: string;
  publishedYear: number;
  language: string;
  pages: number;
  subjects: string[];
  description: string;
  coverUrl: string;
  copies: number;
}

const BOOKS: BookSpec[] = [
  {
    title: 'The Midnight Library',
    authors: ['Matt Haig'],
    isbn: '9780525559474',
    publisher: 'Viking',
    publishedYear: 2020,
    language: 'en',
    pages: 304,
    subjects: ['Fiction', 'Fantasy', 'Philosophy'],
    description:
      'Between life and death there is a library, and within it every book offers a chance to try another life.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780525559474-L.jpg',
    copies: 3,
  },
  {
    title: 'Project Hail Mary',
    authors: ['Andy Weir'],
    isbn: '9780593135204',
    publisher: 'Ballantine Books',
    publishedYear: 2021,
    language: 'en',
    pages: 496,
    subjects: ['Science Fiction', 'Adventure'],
    description:
      'A lone astronaut must save the earth from disaster in this propulsive tale of discovery and friendship.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780593135204-L.jpg',
    copies: 3,
  },
  {
    title: 'Sapiens',
    authors: ['Yuval Noah Harari'],
    isbn: '9780062316097',
    publisher: 'Harper',
    publishedYear: 2015,
    language: 'en',
    pages: 464,
    subjects: ['History', 'Anthropology', 'Nonfiction'],
    description:
      'A brief history of humankind, from the cognitive revolution to the present day.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg',
    copies: 2,
  },
  {
    title: 'Designing Data-Intensive Applications',
    authors: ['Martin Kleppmann'],
    isbn: '9781449373320',
    publisher: "O'Reilly Media",
    publishedYear: 2017,
    language: 'en',
    pages: 616,
    subjects: ['Computer Science', 'Databases', 'Engineering'],
    description:
      'The big ideas behind reliable, scalable, and maintainable data systems.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781449373320-L.jpg',
    copies: 1,
  },
  {
    title: 'The Pragmatic Programmer',
    authors: ['David Thomas', 'Andrew Hunt'],
    isbn: '9780135957059',
    publisher: 'Addison-Wesley',
    publishedYear: 2019,
    language: 'en',
    pages: 352,
    subjects: ['Computer Science', 'Engineering', 'Nonfiction'],
    description:
      'Your journey to mastery, with practical advice for developers at every stage.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780135957059-L.jpg',
    copies: 2,
  },
  {
    title: 'The Name of the Wind',
    authors: ['Patrick Rothfuss'],
    isbn: '9780756404741',
    publisher: 'DAW Books',
    publishedYear: 2007,
    language: 'en',
    pages: 662,
    subjects: ['Fantasy', 'Fiction'],
    description:
      'The riveting first-person narrative of Kvothe, a young man who grows to be one of the most notorious wizards.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780756404741-L.jpg',
    copies: 2,
  },
  {
    title: 'Clean Code',
    authors: ['Robert C. Martin'],
    isbn: '9780132350884',
    publisher: 'Prentice Hall',
    publishedYear: 2008,
    language: 'en',
    pages: 464,
    subjects: ['Computer Science', 'Engineering'],
    description:
      'A handbook of agile software craftsmanship with principles, patterns, and practices.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg',
    copies: 2,
  },
  {
    title: 'Atomic Habits',
    authors: ['James Clear'],
    isbn: '9780735211292',
    publisher: 'Avery',
    publishedYear: 2018,
    language: 'en',
    pages: 320,
    subjects: ['Psychology', 'Self-Help', 'Nonfiction'],
    description:
      'An easy and proven way to build good habits and break bad ones.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',
    copies: 2,
  },
  {
    title: 'The Hobbit',
    authors: ['J. R. R. Tolkien'],
    isbn: '9780547928227',
    publisher: 'Houghton Mifflin Harcourt',
    publishedYear: 1937,
    language: 'en',
    pages: 300,
    subjects: ['Fantasy', 'Classics', 'Fiction'],
    description:
      'Bilbo Baggins is swept into a quest to reclaim the lost Dwarf Kingdom of Erebor.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg',
    copies: 2,
  },
  {
    title: 'Dune',
    authors: ['Frank Herbert'],
    isbn: '9780441172719',
    publisher: 'Ace',
    publishedYear: 1965,
    language: 'en',
    pages: 688,
    subjects: ['Science Fiction', 'Classics', 'Adventure'],
    description:
      'Set on the desert planet Arrakis, a story of politics, prophecy, and survival.',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg',
    copies: 2,
  },
];

async function upsertUser(email: string, password: string, name: string, role: Role) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { email, name, role, passwordHash },
  });
}

async function upsertMember(input: {
  email: string;
  password: string;
  name: string;
  membershipNo: string;
  phone: string;
}) {
  const user = await upsertUser(input.email, input.password, input.name, 'MEMBER');
  const member = await prisma.member.upsert({
    where: { userId: user.id },
    update: { status: 'ACTIVE' },
    create: {
      userId: user.id,
      membershipNo: input.membershipNo,
      phone: input.phone,
      expiresAt: addDays(new Date(), 365),
    },
  });
  return { user, member };
}

async function upsertBook(spec: BookSpec): Promise<BookDocument> {
  let doc = await Book.findOne({ isbn: spec.isbn });
  if (!doc) {
    doc = await Book.create({
      title: spec.title,
      authors: spec.authors,
      isbn: spec.isbn,
      publisher: spec.publisher,
      publishedYear: spec.publishedYear,
      language: spec.language,
      pages: spec.pages,
      subjects: spec.subjects,
      description: spec.description,
      coverUrl: spec.coverUrl,
      status: 'ACTIVE',
    });
  } else if (doc.status !== 'ACTIVE') {
    doc.status = 'ACTIVE';
    await doc.save();
  }

  const plain = doc.toObject() as unknown as BookDocument;
  const existingCopies = await prisma.bookCopy.count({ where: { bookId: String(doc._id) } });
  if (existingCopies === 0) {
    await createCopies(plain, spec.copies);
  }
  return plain;
}

async function main(): Promise<void> {
  await connectMongo();

  const admin = await upsertUser('admin@library.dev', 'Admin123!', 'Avery Admin', 'ADMIN');
  const librarian = await upsertUser(
    'librarian@library.dev',
    'Librarian123!',
    'Lena Librarian',
    'LIBRARIAN',
  );

  const maya = await upsertMember({
    email: 'member@library.dev',
    password: 'Member123!',
    name: 'Maya Reader',
    membershipNo: 'M-100001',
    phone: '555-0101',
  });
  const priya = await upsertMember({
    email: 'priya@library.dev',
    password: 'Member123!',
    name: 'Priya Sharma',
    membershipNo: 'M-100002',
    phone: '555-0102',
  });
  await upsertMember({
    email: 'daniel@library.dev',
    password: 'Member123!',
    name: 'Daniel Okafor',
    membershipNo: 'M-100003',
    phone: '555-0103',
  });

  const bookDocs: BookDocument[] = [];
  for (const spec of BOOKS) {
    bookDocs.push(await upsertBook(spec));
  }

  const booksByIsbn = new Map(bookDocs.map((book) => [book.isbn, book]));
  const book = (isbn: string) => {
    const found = booksByIsbn.get(isbn);
    if (!found) throw new Error(`Seed book missing: ${isbn}`);
    return found;
  };
  const copiesOf = (isbn: string) =>
    prisma.bookCopy.findMany({
      where: { bookId: String(book(isbn)._id) },
      orderBy: { copyCode: 'asc' },
    });

  if ((await prisma.loan.count()) === 0) {
    const now = new Date();
    const book0 = book('9780525559474');
    const book1 = book('9780593135204');
    const book2 = book('9780062316097');
    const book3 = book('9781449373320');
    const book4 = book('9780135957059');
    const book7 = book('9780735211292');

    const copies0 = await copiesOf(book0.isbn);
    const copies1 = await copiesOf(book1.isbn);
    const copies2 = await copiesOf(book2.isbn);
    const copies3 = await copiesOf(book3.isbn);
    const copies4 = await copiesOf(book4.isbn);
    const copies7 = await copiesOf(book7.isbn);

    const activeA = await prisma.loan.create({
      data: {
        copyId: copies0[0].id,
        bookId: String(book0._id),
        memberId: maya.member.id,
        issuedById: librarian.id,
        checkedOutAt: addDays(now, -9),
        dueAt: addDays(now, 21),
        status: 'ACTIVE',
      },
    });
    await prisma.bookCopy.update({
      where: { id: copies0[0].id },
      data: { status: 'ON_LOAN' },
    });

    await prisma.loan.create({
      data: {
        copyId: copies1[0].id,
        bookId: String(book1._id),
        memberId: maya.member.id,
        issuedById: librarian.id,
        checkedOutAt: addDays(now, -34),
        dueAt: addDays(now, -4),
        status: 'ACTIVE',
      },
    });
    await prisma.bookCopy.update({
      where: { id: copies1[0].id },
      data: { status: 'ON_LOAN' },
    });

    const returned = await prisma.loan.create({
      data: {
        copyId: copies2[0].id,
        bookId: String(book2._id),
        memberId: maya.member.id,
        issuedById: librarian.id,
        checkedOutAt: addDays(now, -40),
        dueAt: addDays(now, -10),
        returnedAt: addDays(now, -3),
        status: 'RETURNED',
        fineAmount: 3500,
        renewedCount: 0,
      },
    });
    const partialFine = await prisma.fine.create({
      data: {
        loanId: returned.id,
        memberId: maya.member.id,
        amount: 3500,
        paidAmount: 1000,
        reason: 'OVERDUE',
        status: 'PARTIAL',
        assessedAt: addDays(now, -3),
      },
    });
    await prisma.payment.create({
      data: {
        fineId: partialFine.id,
        memberId: maya.member.id,
        amount: 1000,
        method: 'CASH',
        paidAt: addDays(now, -2),
        receivedById: librarian.id,
        reference: 'Desk payment',
      },
    });

    await prisma.loan.create({
      data: {
        copyId: copies3[0].id,
        bookId: String(book3._id),
        memberId: priya.member.id,
        issuedById: librarian.id,
        checkedOutAt: addDays(now, -11),
        dueAt: addDays(now, 19),
        status: 'ACTIVE',
      },
    });
    await prisma.bookCopy.update({
      where: { id: copies3[0].id },
      data: { status: 'ON_LOAN' },
    });
    await prisma.reservation.create({
      data: {
        bookId: String(book3._id),
        memberId: maya.member.id,
        status: 'QUEUED',
        createdAt: addDays(now, -2),
      },
    });

    const paidLoan = await prisma.loan.create({
      data: {
        copyId: copies7[0].id,
        bookId: String(book7._id),
        memberId: priya.member.id,
        issuedById: librarian.id,
        checkedOutAt: addDays(now, -50),
        dueAt: addDays(now, -20),
        returnedAt: addDays(now, -10),
        status: 'RETURNED',
        fineAmount: 5000,
      },
    });
    const paidFine = await prisma.fine.create({
      data: {
        loanId: paidLoan.id,
        memberId: priya.member.id,
        amount: 5000,
        paidAmount: 5000,
        reason: 'OVERDUE',
        status: 'PAID',
        assessedAt: addDays(now, -10),
        paidAt: addDays(now, -10),
      },
    });
    await prisma.payment.create({
      data: {
        fineId: paidFine.id,
        memberId: priya.member.id,
        amount: 5000,
        method: 'CARD',
        paidAt: addDays(now, -10),
        receivedById: librarian.id,
        reference: 'CARD-4815',
      },
    });

    await prisma.bookCopy.update({
      where: { id: copies4[0].id },
      data: { status: 'RESERVED' },
    });
    await prisma.reservation.create({
      data: {
        bookId: String(book4._id),
        memberId: maya.member.id,
        copyId: copies4[0].id,
        status: 'READY',
        readyAt: addHours(now, -10),
        expiresAt: addHours(now, 38),
      },
    });

    logger.info('Seeded demo circulation', {
      activeLoan: activeA.id,
      returnedLoan: returned.id,
      partialFine: partialFine.id,
    });
  }

  if ((await Review.countDocuments()) === 0) {
    const now = new Date();
    const book2 = book('9780062316097');
    const book7 = book('9780735211292');

    await Review.create([
      {
        bookId: String(book2._id),
        userId: maya.user.id,
        memberName: 'Maya Reader',
        rating: 4,
        title: 'Wide-ranging and readable',
        body: 'A big-picture history that made me rethink several assumptions. Dense in places, but worth it.',
        verifiedBorrow: true,
        createdAt: addDays(now, -2),
      },
      {
        bookId: String(book7._id),
        userId: priya.user.id,
        memberName: 'Priya Sharma',
        rating: 5,
        title: 'Immediately practical',
        body: 'Small changes, clearly explained. I started using the habit stacking idea the same week.',
        verifiedBorrow: true,
        createdAt: addDays(now, -8),
      },
    ]);

    for (const bookId of [String(book2._id), String(book7._id)]) {
      const aggregate = await Review.aggregate<{ _id: null; avg: number; count: number }>([
        { $match: { bookId } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]);
      await Book.findByIdAndUpdate(bookId, {
        $set: {
          ratingAvg: Math.round((aggregate[0]?.avg ?? 0) * 10) / 10,
          ratingCount: aggregate[0]?.count ?? 0,
        },
      });
    }
    logger.info('Seeded reviews');
  }

  if ((await Notification.countDocuments()) === 0) {
    const book1 = book('9780593135204');
    const book2 = book('9780062316097');
    const book4 = book('9780135957059');
    const now = new Date();

    await Notification.create([
      {
        userId: maya.user.id,
        type: 'HOLD_READY',
        title: 'Hold ready for pickup',
        body: `${book4.title} is ready. Pick it up within 48 hours.`,
        data: { bookId: String(book4._id) },
        createdAt: now,
      },
      {
        userId: maya.user.id,
        type: 'OVERDUE',
        title: 'Overdue book',
        body: `${book1.title} is 4 days overdue. The projected fine is ₹20.00.`,
        data: { bookId: String(book1._id) },
        createdAt: addDays(now, -1),
      },
      {
        userId: maya.user.id,
        type: 'FINE',
        title: 'Fine assessed',
        body: `${book2.title} was returned overdue. A ₹35.00 fine was added to your account.`,
        data: { bookId: String(book2._id) },
        createdAt: addDays(now, -3),
      },
      {
        userId: priya.user.id,
        type: 'PAYMENT',
        title: 'Payment received',
        body: 'We received ₹50.00 toward your library balance. Thank you!',
        createdAt: addDays(now, -10),
      },
    ]);
    logger.info('Seeded notifications');
  }

  logger.info('Seed complete', {
    admin: admin.email,
    librarian: librarian.email,
    members: [maya.user.email, priya.user.email],
  });

  await disconnectMongo();
  await prisma.$disconnect();
}

main().catch(async (err: Error) => {
  logger.error('Seed failed', { error: err.message, stack: err.stack });
  await prisma.$disconnect().catch(() => undefined);
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
