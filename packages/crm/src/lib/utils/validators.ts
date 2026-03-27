import { z } from "zod";

export const createContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  status: z.string().min(1),
});

export const createDealSchema = z.object({
  title: z.string().min(1),
  value: z.coerce.number().nonnegative(),
  contactId: z.string().uuid(),
});

export const createActivitySchema = z.object({
  type: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().optional(),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
});
