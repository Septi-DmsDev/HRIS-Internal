import { format } from "date-fns";
import {
  getEmployeeFormOptions,
  getEmployees,
} from "@/server/actions/employees";
import EmployeesTable, {
  type EmployeeFormOptions,
  type EmployeeRow,
} from "./EmployeesTable";

export default async function EmployeesPage() {
  const [employees, options] = await Promise.all([
    getEmployees(),
    getEmployeeFormOptions(),
  ]);

  const employeeRecords = employees as Array<{
    id: string;
    employeeCode: string;
    nik: string | null;
    fullName: string;
    employmentStatus: "TRAINING" | "REGULER" | "DIALIHKAN_TRAINING" | "TIDAK_LOLOS" | "NONAKTIF" | "RESIGN";
    phoneNumber: string | null;
    bpjsKetenagakerjaanNumber: string | null;
    bpjsKetenagakerjaanActive: boolean;
    bpjsKesehatanNumber: string | null;
    bpjsKesehatanActive: boolean;
    startDate: Date;
  }>;

  const rows: EmployeeRow[] = employeeRecords.map((employee) => {
    const startDate = format(employee.startDate, "yyyy-MM-dd");
    const nik = employee.nik ?? "";
    const phone = employee.phoneNumber ?? "-";
    const uid = employee.employeeCode ?? "";
    const name = employee.fullName ?? "";

    return {
      id: employee.id,
      employeeCode: uid,
      nik: employee.nik,
      fullName: name,
      employmentStatus: employee.employmentStatus,
      phoneNumber: phone,
      bpjsKetenagakerjaanNumber: employee.bpjsKetenagakerjaanNumber,
      bpjsKetenagakerjaanActive: employee.bpjsKetenagakerjaanActive,
      bpjsKesehatanNumber: employee.bpjsKesehatanNumber,
      bpjsKesehatanActive: employee.bpjsKesehatanActive,
      startDate,
    };
  });

  const formOptions: EmployeeFormOptions = {
    branches: options.branches,
    divisions: options.divisions,
    positions: options.positions,
    grades: options.grades,
    schedules: options.schedules,
    supervisors: options.supervisors,
    canManage: options.canManage,
    isSuperAdmin: options.isSuperAdmin,
  };

  return (
    <div className="space-y-4">
      <EmployeesTable data={rows} options={formOptions} />
    </div>
  );
}
