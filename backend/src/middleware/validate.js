import { AppError } from '../utils/AppError.js';

export function validate(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse({
      body: req.body ?? {},
      query: req.query ?? {},
      params: req.params ?? {},
    });

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      next(new AppError('VALIDATION_ERROR', 'Request validation failed', 422, details));
      return;
    }

    req.validated = parsed.data;
    next();
  };
}
