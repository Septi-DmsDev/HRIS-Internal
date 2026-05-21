import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUserRoleRow } from "@/lib/auth/session";
import { getBranches } from "@/server/actions/branches";
import { getDivisions } from "@/server/actions/divisions";
import { getEmployeeGroupConfigs } from "@/server/actions/employee-group-configs";
import { getGrades } from "@/server/actions/grades";
import { getPointCatalogOverview } from "@/server/actions/point-catalog";
import { getPositions } from "@/server/actions/positions";
import { getWorkShiftMasters } from "@/server/actions/work-schedules";
import BranchesTable, { type BranchRow } from "./branches/BranchesTable";
import CatalogPoinClient, {
  type PerformanceCatalogEntryRow,
} from "./catalogpoin/CatalogPoinClient";
import DivisionsTable, {
  type BranchOption,
  type DivisionRow,
} from "./divisions/DivisionsTable";
import EmployeeGroupConfigsTable, {
  type EmployeeGroupConfigRow,
} from "./employee-groups/EmployeeGroupConfigsTable";
import GradesTable, { type GradeRow } from "./grades/GradesTable";
import PositionsTable, { type PositionRow } from "./positions/PositionsTable";
import MasterShiftClient, { type WorkShiftRow } from "./MasterShiftClient";
import type { UserRole } from "@/types";

export default async function MasterPage() {
  const [roleRow, branches, divisions, positions, grades, employeeGroupConfigs, overview, shifts] = await Promise.all([
    getCurrentUserRoleRow(),
    getBranches(),
    getDivisions(),
    getPositions(),
    getGrades(),
    getEmployeeGroupConfigs(),
    getPointCatalogOverview(),
    getWorkShiftMasters(),
  ]);

  const branchRows: BranchRow[] = branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    address: branch.address,
    latitude: branch.latitude != null ? String(branch.latitude) : null,
    longitude: branch.longitude != null ? String(branch.longitude) : null,
    maxAttendanceRadiusMeters: branch.maxAttendanceRadiusMeters,
    isActive: branch.isActive,
  }));

  const entryRows: PerformanceCatalogEntryRow[] = overview.latestEntries.map((entry) => ({
    id: entry.id,
    divisionName: entry.divisionName,
    externalCode: entry.externalCode ?? "-",
    workName: entry.workName,
    pointValue: entry.pointValue,
    unitDescription: entry.unitDescription ?? "-",
  }));

  const branchOptions: BranchOption[] = branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
  }));

  const divisionRows: DivisionRow[] = divisions.map((division) => ({
    id: division.id,
    name: division.name,
    code: division.code,
    trainingPassPercent: division.trainingPassPercent,
    dailyPointTarget: division.dailyPointTarget,
    isActive: division.isActive,
    branchId: division.branchId,
  }));

  const positionRows: PositionRow[] = positions.map((position) => ({
    id: position.id,
    name: position.name,
    code: position.code,
    employeeGroup: position.employeeGroup,
    isActive: position.isActive,
  }));

  const gradeRows: GradeRow[] = grades.map((grade) => ({
    id: grade.id,
    name: grade.name,
    code: grade.code,
    description: grade.description,
    isActive: grade.isActive,
  }));

  const employeeGroupRows: EmployeeGroupConfigRow[] = employeeGroupConfigs.map((config) => ({
    id: config.id,
    employeeGroup: config.employeeGroup,
    displayName: config.displayName,
    baseSalaryAmount: config.baseSalaryAmount != null ? Number(config.baseSalaryAmount) : null,
    legacyAlias: config.legacyAlias,
    payrollMode: config.payrollMode,
    description: config.description,
    sortOrder: config.sortOrder,
    isActive: config.isActive,
  }));

  const shiftRows: WorkShiftRow[] = shifts.map((shift) => ({
    id: shift.id,
    code: shift.code,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakStart: shift.breakStart ?? null,
    breakEnd: shift.breakEnd ?? null,
    checkOutStart: shift.checkOutStart ?? null,
    checkInToleranceMinutes: shift.checkInToleranceMinutes,
    breakToleranceMinutes: shift.breakToleranceMinutes,
    checkOutToleranceMinutes: shift.checkOutToleranceMinutes,
    isOvernight: shift.isOvernight,
    applicableDivisionCodes: shift.applicableDivisionCodes ?? [],
    notes: shift.notes ?? "",
    sortOrder: shift.sortOrder,
    isActive: shift.isActive,
  }));

  return (
    <div className="space-y-4">
      <Tabs defaultValue="catalog">
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="catalog">Katalog Poin</TabsTrigger>
          <TabsTrigger value="branches">Cabang</TabsTrigger>
          <TabsTrigger value="divisions">Divisi</TabsTrigger>
          <TabsTrigger value="positions">Jabatan</TabsTrigger>
          <TabsTrigger value="grades">Grade</TabsTrigger>
          <TabsTrigger value="employee-groups">Kelompok Karyawan</TabsTrigger>
          <TabsTrigger value="master-shift">Master Shift</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-4">
          <CatalogPoinClient
            role={roleRow.role as UserRole}
            canManageCatalog={overview.canManageCatalog}
            entries={entryRows}
          />
        </TabsContent>

        <TabsContent value="branches" className="space-y-4">
          <BranchesTable data={branchRows} />
        </TabsContent>

        <TabsContent value="divisions" className="space-y-4">
          <DivisionsTable data={divisionRows} branches={branchOptions} />
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <PositionsTable data={positionRows} />
        </TabsContent>

        <TabsContent value="grades" className="space-y-4">
          <GradesTable data={gradeRows} />
        </TabsContent>

        <TabsContent value="employee-groups" className="space-y-4">
          <EmployeeGroupConfigsTable data={employeeGroupRows} />
        </TabsContent>

        <TabsContent value="master-shift" className="space-y-4">
          <MasterShiftClient shifts={shiftRows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
