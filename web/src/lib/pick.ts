import { useSearchParams } from 'react-router-dom'
import { useEngagements } from './store'
export function usePicked() {
  const list = useEngagements(); const [sp, setSp] = useSearchParams()
  const id = sp.get('e')
  const rec = list.find(e => e.id === id) || list[0]
  return { list, rec, pick: (e: string) => { sp.set('e', e); setSp(sp, { replace: true }) } }
}
