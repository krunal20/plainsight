/**
 * ReportViewWrapper — reads askResult from store and renders Report.
 */
import { useStore } from '../state/store';
import { Report } from '../pages/Report';

export default function ReportViewWrapper() {
  const askResult = useStore(s => s.askResult);
  return <Report response={askResult} />;
}
