export const toNumber = (value) => Number(value) || 0;

export const formatGram = (value) => `${Math.abs(toNumber(value)).toFixed(1)}g`;

export const getBalanceDisplay = (balance) => {
  const amount = toNumber(balance);
  const isAdvance = amount >= 0;

  return {
    label: isAdvance ? 'Advance' : 'Balance',
    value: formatGram(amount),
    text: `${isAdvance ? 'Advance' : 'Balance'} : ${formatGram(amount)}`,
    color: isAdvance ? '#059669' : '#DC2626',
    bg: isAdvance ? '#ECFDF5' : '#FEF2F2',
    border: isAdvance ? '#86EFAC' : '#FCA5A5',
  };
};

export const getDueBalanceDisplay = (dueBalance) =>
  getBalanceDisplay(-toNumber(dueBalance));

export const getCustomerBalanceDisplay = (customer) =>
  getBalanceDisplay(toNumber(customer?.ab) - toNumber(customer?.ob));
