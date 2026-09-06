import "../lib/ores-decorators.js";
using TypeSpec.Reflection;

namespace Ores;

extern dec table(target: Model, name: valueof string);
extern dec unique(target: Model, fields: valueof string);
extern dec index(target: Model, fields: valueof string);
extern dec references(target: ModelProperty, to: valueof string);
