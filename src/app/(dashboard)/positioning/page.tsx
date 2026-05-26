import { getDivisionManagementOptions, getEmployees } from "@/server/actions/employees";
import DivisionManagementTable, { type DivisionEmployeeRow, type DivisionManagementOptions } from "./DivisionManagementTable";

export default async function DivisiPage() {
  const [employees, options] = await Promise.all([getEmployees(), getDivisionManagementOptions()]);

  const rows: DivisionEmployeeRow[] = employees
    .filter((employee) => employee.employmentStatus !== "RESIGN")
    .map((employee) => ({
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    branchName: employee.branchName ?? "-",
    divisionName: employee.divisionName ?? "-",
    positionName: employee.positionName ?? "-",
    gradeName: employee.gradeName ?? "-",
    employeeGroup: employee.employeeGroup,
    isActive: employee.isActive,
  }));

  const formOptions: DivisionManagementOptions = {
    branches: options.branches,
    divisions: options.divisions,
    positions: options.positions,
    grades: options.grades,
  };

  return <DivisionManagementTable data={rows} options={formOptions} />;
}
