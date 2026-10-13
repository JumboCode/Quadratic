import { useParams } from 'react-router-dom';
import { IssueDetail } from '../components/issue/IssueDetail';

export function IssuePage() {
  const { identifier } = useParams();
  return <IssueDetail identifier={identifier!} />;
}
