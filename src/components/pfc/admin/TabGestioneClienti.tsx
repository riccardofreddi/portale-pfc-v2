'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { UserPlus, Trash2, Edit, Loader2, Users } from 'lucide-react'

interface Cliente { username: string; name: string; exemptMaintenance: boolean; createdAt: string }

export function TabGestioneClienti() {
  const [clienti, setClienti] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [editName, setEditName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      const r = await api.clienti.list()
      setClienti(r.clienti)
    } catch { toast.error('Errore caricamento clienti') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function handleCreate() {
    setCreating(true)
    try {
      await api.clienti.create({ username: newUsername, name: newName, password: newPassword })
      toast.success(`Cliente ${newName} registrato`)
      setNewName(''); setNewUsername(''); setNewPassword('')
      await refresh()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
    finally { setCreating(false) }
  }

  async function handleDelete(username: string) {
    try { await api.clienti.delete(username); toast.success('Cliente eliminato'); await refresh() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  function openEdit(c: Cliente) {
    setEditing(c); setEditName(c.name); setEditUsername(c.username); setEditPassword('')
  }

  async function handleSaveEdit() {
    if (!editing) return
    try {
      await api.clienti.update({ oldUsername: editing.username, newUsername: editUsername, newName: editName, newPassword: editPassword || undefined })
      toast.success('Modifiche salvate'); setEditing(null); await refresh()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  if (loading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-5 w-5 text-emerald-600" /> Nuovo Cliente</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rs">Ragione Sociale</Label>
            <Input id="rs" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="es. Rossi Mario S.r.l." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="us">Username</Label>
            <Input id="us" value={newUsername} onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} placeholder="es. rossi" maxLength={20} />
            <p className="text-[11px] text-slate-500">3-20 caratteri, solo lettere minuscole e numeri</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input id="pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimo 4 caratteri" />
          </div>
          <Button onClick={handleCreate} disabled={creating || !newName || !newUsername || !newPassword} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white">
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />} Registra Cliente
          </Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /> Clienti registrati ({clienti.length})</CardTitle></CardHeader>
        <CardContent>
          {clienti.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Nessun cliente registrato</p>
          ) : (
            <div className="space-y-2">
              {clienti.map((c) => (
                <div key={c.username} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                      {c.exemptMaintenance && <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Esente</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">@{c.username}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Elimina cliente {c.name}?</AlertDialogTitle>
                          <AlertDialogDescription>Operazione irreversibile. Verranno eliminati anche tutti i documenti su Cloudflare R2 e lo storico messaggi/notifiche.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(c.username)} className="bg-red-600 hover:bg-red-700">Elimina definitivamente</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica cliente</DialogTitle>
            <DialogDescription>Modifica i dati del cliente. Lascia la password vuota per mantenerla.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Ragione Sociale</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Username</Label><Input value={editUsername} onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} maxLength={20} /></div>
            <div className="space-y-1.5"><Label>Nuova password (opzionale)</Label><Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Mantieni attuale" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button>
            <Button onClick={handleSaveEdit} className="bg-emerald-700 hover:bg-emerald-800 text-white">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
