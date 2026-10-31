export const parseMultiSelectQueryValues = (values = []) => {
  const items = Array.isArray(values) ? values : [values];
  return [...new Set(items
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean))];
};

export const withMultiSelectQueryParam = (params, key, values) => {
  const nextParams = { ...params };
  const selectedValues = parseMultiSelectQueryValues(values);
  if (selectedValues.length) nextParams[key] = selectedValues.join(",");
  else delete nextParams[key];
  return nextParams;
};
