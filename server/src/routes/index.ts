import { Router } from 'express';
import { authRouter } from './auth';
import { booksRouter } from './books';
import { loansRouter } from './loans';
import { reservationsRouter } from './reservations';
import { finesRouter } from './fines';
import { membersRouter, meRouter } from './members';
import { notificationsRouter } from './notifications';
import { reportsRouter } from './reports';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/books', booksRouter);
apiRouter.use('/loans', loansRouter);
apiRouter.use('/reservations', reservationsRouter);
apiRouter.use('/fines', finesRouter);
apiRouter.use('/members', membersRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/reports', reportsRouter);
