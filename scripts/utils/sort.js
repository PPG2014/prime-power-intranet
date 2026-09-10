/** เรียงตามลำดับหน่วยงานที่ฝ่ายบุคคลกำหนด ไม่ใช่เรียงตามตัวอักษร */
export const byDepartmentOrder = (departments) => (a, b) => {
  const i = departments.findIndex((d) => d.Title === a);
  const j = departments.findIndex((d) => d.Title === b);
  return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
};
