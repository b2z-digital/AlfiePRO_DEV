const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('default', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export { formatDate };