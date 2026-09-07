import { useState, useEffect, useCallback } from 'react'
import { fetchAccountsSnapshot } from '../lib/success/accounts'
import { fetchExpansionSnapshot } from '../lib/success/expansion'
import type { Account, AccountsSnapshot, ExpansionSnapshot } from '../lib/success/types'
import type { Task } from '../types'

type Notify = (msg: string, type?: 'success' | 'error') => void
type AddTask = (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void

const EMPTY_ACCOUNTS: AccountsSnapshot = { accounts: [], activeCount: 0, avgHealthScore: 0, atRiskCount: 0, demo: true }
const EMPTY_EXPANSION: ExpansionSnapshot = { pipelineAmount: 0, deals: [], demo: true }

export function useCustomerSuccess(notify: Notify, addTask: AddTask) {
  const [accountsSnapshot, setAccountsSnapshot] = useState<AccountsSnapshot>(EMPTY_ACCOUNTS)
  const [expansion, setExpansion] = useState<ExpansionSnapshot>(EMPTY_EXPANSION)
  const [loading, setLoading] = useState(true)
  const [flagged, setFlagged] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    setLoading(true)
    const [a, e] = await Promise.allSettled([fetchAccountsSnapshot(), fetchExpansionSnapshot()])
    if (a.status === 'fulfilled') setAccountsSnapshot(a.value)
    else notify(a.reason instanceof Error ? a.reason.message : 'Failed to load accounts', 'error')
    if (e.status === 'fulfilled') setExpansion(e.value)
    else notify(e.reason instanceof Error ? e.reason.message : 'Failed to load expansion pipeline', 'error')
    setLoading(false)
  }, [notify])

  useEffect(() => { reload() }, [reload])

  const flagForFollowUp = useCallback((account: Account) => {
    const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const seen = account.lastSeenDaysAgo !== null
      ? ` — last active ${account.lastSeenDaysAgo} day${account.lastSeenDaysAgo === 1 ? '' : 's'} ago`
      : ' — never seen active'
    const openConvo = account.openConversations > 0
      ? `, ${account.openConversations} open support conversation${account.openConversations === 1 ? '' : 's'}`
      : ''
    addTask({
      title: `Check in with ${account.name}${account.company ? ` at ${account.company}` : ''}`,
      description: `Health score ${account.healthScore}/100${seen}${openConvo}.`,
      status: 'todo',
      priority: account.status === 'at_risk' ? 'high' : 'medium',
      dueDate,
      agent: 'success',
      tags: ['customer-success', account.status.replace('_', '-')],
    })
    setFlagged(prev => new Set(prev).add(account.id))
    notify(`Follow-up task created for ${account.name}`)
  }, [addTask, notify])

  return {
    accounts: accountsSnapshot.accounts,
    activeCount: accountsSnapshot.activeCount,
    avgHealthScore: accountsSnapshot.avgHealthScore,
    atRiskCount: accountsSnapshot.atRiskCount,
    demoAccounts: accountsSnapshot.demo,
    expansion,
    loading,
    flagged,
    flagForFollowUp,
    refresh: reload,
  }
}
