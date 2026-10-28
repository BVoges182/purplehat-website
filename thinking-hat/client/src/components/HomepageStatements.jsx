import { Statement } from "./ManagementReportView";
import demo from "../demoReportStatements.json";
import { threeMonthComparison } from "../statementComparison";

const income = threeMonthComparison(demo.profit, "Income statement");
const balance = threeMonthComparison(demo.balance, "Balance sheet");

export default function HomepageStatements() {
  return (
    <div className="statements-frame">
      <div className="statements-board">
        <div className="min-w-0 overflow-x-auto">
          <Statement section={income} />
        </div>
        <div className="min-w-0 overflow-x-auto">
          <Statement section={balance} />
        </div>
      </div>
    </div>
  );
}
