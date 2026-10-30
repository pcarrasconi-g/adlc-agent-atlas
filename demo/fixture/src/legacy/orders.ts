// Legacy module: known lint debt, owned by another team.
export function total(items: number[]): number {
  var sum = 0;
  for (var i = 0; i < items.length; i++) {
    sum += items[i];
  }
  console.log("total computed");
  return sum;
}
