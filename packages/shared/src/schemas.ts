import { z } from "zod";

export const triStateSchema = z.enum(["YES", "NO", "UNKNOWN"]);
export const roleSchema = z.enum(["ADMIN", "TECH", "VIEWER"]);
export const sessionModeSchema = z.enum(["WEB", "NATIVE"]);
export const sessionStatusSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "ENDED",
  "FAILED",
  "EXPIRED",
]);
export const vncUiStateSchema = z.enum([
  "READY",
  "NOT_LISTENING",
  "NOT_INSTALLED",
  "OFFLINE",
  "UNKNOWN",
]);

const hostnameSchema = z.string().trim().min(1).max(100);
const ipSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,3}){3}$/, "IP inválida")
  .nullable();
const coordSchema = z.number().min(0).max(1);
const vncPortSchema = z.number().int().min(5900).max(5909);
export const adUsernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{1,64}$/);
export const qualityCheckSchema = z.enum([
  "sinColocar",
  "sinLugar",
  "sinUsuario",
  "usuarioDistinto",
  "sinIp",
  "sinInventario",
  "noEnGlpi",
  "usuarioFueraDirectorio",
  "posicionSolapada",
]);

export const computerCreateSchema = z.object({
  hostname: hostnameSchema,
  ip: ipSchema.optional(),
  mac: z.string().trim().max(32).optional(),
  assignedTo: z.string().trim().max(120).optional(),
  phoneExt: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
  assetTag: z.string().trim().max(60).optional(),
  serial: z.string().trim().max(60).optional(),
  floorId: z.string().cuid().nullish(),
  officeId: z.string().cuid().nullish(),
  departmentId: z.string().cuid().nullish(),
  posX: coordSchema.nullish(),
  posY: coordSchema.nullish(),
  vncPort: vncPortSchema.optional(),
  credentialId: z.string().cuid().nullish(),
  vncOverride: triStateSchema.nullish(),
});

export const computerPatchSchema = z
  .object({
    assignedTo: z.string().trim().max(120).nullable().optional(),
    phoneExt: z.string().trim().max(20).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    assetTag: z.string().trim().max(60).nullable().optional(),
    floorId: z.string().cuid().nullable().optional(),
    officeId: z.string().cuid().nullable().optional(),
    departmentId: z.string().cuid().nullable().optional(),
    posX: coordSchema.nullable().optional(),
    posY: coordSchema.nullable().optional(),
    vncPort: vncPortSchema.optional(),
    credentialId: z.string().cuid().nullable().optional(),
    vncOverride: triStateSchema.nullable().optional(),
    externalRef: z.string().trim().max(60).nullable().optional(),
    adUsername: adUsernameSchema.nullable().optional(),
  })
  .strict();

export const computerPositionSchema = z.object({
  floorId: z.string().cuid(),
  posX: coordSchema,
  posY: coordSchema,
  officeId: z.string().cuid().nullish(),
  glpiWriteback: z.boolean().optional(),
});

export const computerBulkSchema = z
  .object({
    ids: z.array(z.string().cuid()).min(1).optional(),
    filter: z.record(z.string(), z.unknown()).optional(),
    set: z
      .object({
        credentialId: z.string().cuid().nullable().optional(),
        departmentId: z.string().cuid().nullable().optional(),
      })
      .strict(),
  })
  .refine((v) => v.ids !== undefined || v.filter !== undefined, {
    message: "Debe indicar ids o filter",
  });

export const screenInputSchema = z.object({
  index: z.number().int().min(1).max(4),
  label: z.string().trim().min(1).max(60),
  port: z.number().int().min(5901).max(5909),
  enabled: z.boolean(),
});

export const screensPutSchema = z.array(screenInputSchema).max(4);

export const sessionCreateSchema = z.object({
  mode: sessionModeSchema,
  reason: z.string().trim().max(200).optional(),
  force: z.boolean().optional(),
  screen: z.union([z.literal("desktop"), z.number().int().min(1).max(4)]).optional(),
  groupId: z.string().uuid().optional(),
});

export const buildingCreateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const buildingPatchSchema = buildingCreateSchema.partial().strict();

export const floorCreateSchema = z.object({
  buildingId: z.string().cuid(),
  name: z.string().trim().min(1).max(60),
  level: z.number().int().min(-5).max(20).optional(),
});

export const floorPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    level: z.number().int().min(-5).max(20).optional(),
    planFile: z.string().trim().max(300).nullable().optional(),
    planWidth: z.number().int().min(1).nullable().optional(),
    planHeight: z.number().int().min(1).nullable().optional(),
  })
  .strict();

export const departmentCreateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
});

export const departmentPatchSchema = departmentCreateSchema.partial().strict();

export const officeCreateSchema = z.object({
  floorId: z.string().cuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  departmentId: z.string().cuid().nullish(),
  rect: z
    .object({ x: coordSchema, y: coordSchema, w: coordSchema, h: coordSchema })
    .nullish(),
});

export const officePatchSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    departmentId: z.string().cuid().nullable().optional(),
    rect: z
      .object({ x: coordSchema, y: coordSchema, w: coordSchema, h: coordSchema })
      .nullable()
      .optional(),
  })
  .strict();

export const credentialCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(64),
  isDefault: z.boolean().optional(),
});

export const credentialPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    password: z.string().min(1).max(64).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(40),
  name: z.string().trim().min(1).max(120),
  email: z.string().email().nullable().optional(),
  password: z.string().min(12).max(200),
  role: roleSchema.optional(),
});

export const userPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().email().nullable().optional(),
    role: roleSchema.optional(),
    active: z.boolean().optional(),
    password: z.string().min(12).max(200).optional(),
  })
  .strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(200),
});

export const importCsvSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
  createMissing: z.boolean().optional(),
});

const booleanish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

export const computersListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  buildingId: z.string().cuid().optional(),
  floorId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  officeId: z.string().cuid().optional(),
  state: z.string().optional(),
  unplaced: booleanish.optional(),
  staleInventory: booleanish.optional(),
  multiPending: booleanish.optional(),
  check: qualityCheckSchema.optional(),
  os: z.string().trim().max(120).optional(),
  archived: booleanish.optional(),
  sort: z.string().trim().max(40).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export type ComputerCreateInput = z.infer<typeof computerCreateSchema>;
export type ComputerPatchInput = z.infer<typeof computerPatchSchema>;
export type ComputerPositionInput = z.infer<typeof computerPositionSchema>;
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type ComputersListQuery = z.infer<typeof computersListQuerySchema>;
export type QualityCheck = z.infer<typeof qualityCheckSchema>;
