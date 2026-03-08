import { z } from "zod";

export const updateTariffSchema = z.object({
  rate: z.number().min(0, "Ставка не может быть отрицательной").optional(),
  description: z.string().nullable().optional(),
});
