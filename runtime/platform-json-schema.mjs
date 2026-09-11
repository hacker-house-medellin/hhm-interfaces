import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const document = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../contracts/platform/json-schema/contract.schema.json", import.meta.url)),
    "utf8",
  ),
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = new Map();

export function validateJsonSchemaRecord(model, value) {
  if (!Object.hasOwn(document.$defs, model) || Array.isArray(document.$defs[model].enum)) {
    return { ok: false, errors: [`unknown model ${model}`] };
  }
  if (!validators.has(model)) {
    validators.set(
      model,
      ajv.compile({
        $schema: document.$schema,
        $defs: document.$defs,
        $ref: `#/$defs/${model}`,
      }),
    );
  }
  const validate = validators.get(model);
  const ok = validate(value);
  return ok
    ? { ok: true, value }
    : { ok: false, errors: (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`) };
}

export const jsonSchemaModelNames = Object.freeze(
  Object.entries(document.$defs)
    .filter(([, definition]) => !Array.isArray(definition.enum))
    .map(([name]) => name)
    .sort(),
);
