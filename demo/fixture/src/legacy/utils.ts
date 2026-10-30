// Legacy module: known lint debt, owned by another team.
export function label(id: number): string {
  var prefix = "ORD-";
  console.log("label for", id);
  return prefix + id;
}
