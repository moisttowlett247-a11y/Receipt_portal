=============================================================================
  RECEIPT PROCESSOR — OPERATOR & MULTI-VM CLUSTER ARCHITECTURE GUIDE
=============================================================================

This deployment model is engineered specifically for operators/accountants who 
manage receipt processing and bookkeeping centrally so their clients never have
to touch scripts, batch files, Python, or terminals.

Clients simply submit receipts via the web Client Portal or email them directly.
You run the processing engine locally on your workstation or across a cluster
of Virtual Machines (VMs).

-----------------------------------------------------------------------------
1. OPERATOR WORKSTATION (GUI MODE)
-----------------------------------------------------------------------------
To run the full visual GUI with real-time logs, client dropdown, and controls:
- Windows: Double-click "run_receipt_processor.bat"
- macOS/Linux: ./run_receipt_processor.sh

Features in GUI Mode:
- Visual live activity feed & statistics
- AES-256 Client Profile Manager & direct QuickBooks Online OAuth sync
- Inbox folder monitor & Gmail IMAP monitor

-----------------------------------------------------------------------------
2. DISTRIBUTED MULTI-VM CLUSTER (HEADLESS MODE)
-----------------------------------------------------------------------------
To process high volumes across multiple Virtual Machines (e.g. AWS EC2,
Proxmox, VMware, VirtualBox, or local hypervisors) pointing to a shared storage
directory (Dropbox, Google Drive, OneDrive, SMB/NFS, or SSHFS):

Run on VM 1:
   python receipt_processor.py --headless --worker-id vm-worker-01 --folder /shared/inbox

Run on VM 2:
   python receipt_processor.py --headless --worker-id vm-worker-02 --folder /shared/inbox

Or use the 1-click VM scripts:
- Linux / macOS VMs: ./run_vm_worker.sh vm-worker-01 /shared/inbox
- Windows VMs:       run_vm_worker.bat vm-worker-01 \shared\inbox

HOW MULTI-VM CONCURRENCY WORKS (NO DOUBLE PROCESSING):
- Each worker node uses distributed atomic file locks (.lock.<worker_id>).
- When a receipt appears in /shared/inbox/ClientA/, one VM claims it atomically.
- Other VMs see the lock and process other receipts simultaneously.
- When finished, the receipt is moved to /shared/inbox_archive/ClientA/ and
  logged to Receipt_Data.csv and synced to that client's QuickBooks Online.

-----------------------------------------------------------------------------
3. CLIENT ROUTING (OPTION B SENDER MAPPING)
-----------------------------------------------------------------------------
- In the Client Profile Manager, set the client's "Authorized Sender Emails"
  (e.g., "billing@clientcompany.com, owner@clientcompany.com, @clientcompany.com").
- When clients email receipts to your intake inbox (e.g. receipts@yourfirm.com),
  the engine matches the sender and automatically files the receipt into their
  dedicated subfolder and QuickBooks company!

=============================================================================
