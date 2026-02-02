export function formatCurrency(amount: number, includeDecimals: boolean = false): string {
  const absAmount = Math.abs(amount);

  if (includeDecimals) {
    return absAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return absAmount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}
