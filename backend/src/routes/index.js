import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authRouter } from './authRoutes.js';
import { healthRouter } from './healthRoutes.js';
import { demoRouter } from './demoRoutes.js';
import { memberRouter, organizationRouter } from './organizationRoutes.js';
import { teamRouter } from './teamRoutes.js';
import { serviceRouter } from './serviceRoutes.js';
import { dashboardRouter, incidentRouter, notificationRouter } from './incidentRoutes.js';
import { onCallRouter } from './onCallRoutes.js';
import { escalationRouter } from './escalationRoutes.js';
import { mountIncidentPostmortems, postmortemRouter } from './postmortemRoutes.js';

mountIncidentPostmortems(incidentRouter);

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/demo', demoRouter);
apiRouter.use('/auth', authRouter);

apiRouter.use(authMiddleware);
apiRouter.use('/organization', organizationRouter);
apiRouter.use('/members', memberRouter);
apiRouter.use('/teams', teamRouter);
apiRouter.use('/services', serviceRouter);
apiRouter.use('/incidents', incidentRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/on-call', onCallRouter);
apiRouter.use('/escalation-policies', escalationRouter);
apiRouter.use('/postmortems', postmortemRouter);
