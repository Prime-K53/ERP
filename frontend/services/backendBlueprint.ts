
export const SQL_SCHEMA = `
-- PRIME ERP: MASTER SCHEMA (V6.0)
-- Optimized for WinUI 3 / WPF Local Storage

CREATE TABLE [dbo].[Item] (
    [Id] NVARCHAR(64) PRIMARY KEY,
    [Name] NVARCHAR(256) NOT NULL,
    [SKU] NVARCHAR(128) UNIQUE,
    [Price] DECIMAL(18, 2) DEFAULT 0,
    [Cost] DECIMAL(18, 2) DEFAULT 0,
    [Stock] DECIMAL(18, 4) DEFAULT 0
);

CREATE TABLE [dbo].[LedgerEntry] (
    [Id] NVARCHAR(64) PRIMARY KEY,
    [Date] DATETIME2 NOT NULL,
    [Description] NVARCHAR(MAX),
    [DebitAccountId] NVARCHAR(64) NOT NULL,
    [CreditAccountId] NVARCHAR(64) NOT NULL,
    [Amount] DECIMAL(18, 2) NOT NULL,
    [ReferenceId] NVARCHAR(64),
    [Reconciled] BIT DEFAULT 0
);

CREATE TABLE [dbo].[Invoice] (
    [Id] NVARCHAR(64) PRIMARY KEY,
    [Date] DATETIME2 NOT NULL,
    [DueDate] DATETIME2 NOT NULL,
    [CustomerName] NVARCHAR(256),
    [TotalAmount] DECIMAL(18, 2) NOT NULL,
    [PaidAmount] DECIMAL(18, 2) DEFAULT 0,
    [Status] NVARCHAR(32) DEFAULT 'Unpaid'
);
`;

export const EF_CORE_CONTEXT = `
using Microsoft.EntityFrameworkCore;
using PrimeERP.Core.Models;

namespace PrimeERP.Infrastructure.Persistence;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Item> Inventory => Set<Item>();
    public DbSet<LedgerEntry> Ledger => Set<LedgerEntry>();
    public DbSet<Invoice> Invoices => Set<Invoice>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Enforcement of Double-Entry Precision
        modelBuilder.Entity<LedgerEntry>()
            .Property(p => p.Amount)
            .HasPrecision(18, 2);

        // Globalization for Decimal mapping in SQLite
        if (Database.IsSqlite())
        {
            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                var properties = entityType.ClrType.GetProperties()
                    .Where(p => p.PropertyType == typeof(decimal));
                foreach (var property in properties)
                {
                    modelBuilder.Entity(entityType.Name).Property(property.Name).HasConversion<double>();
                }
            }
        }
    }
}
`;

export const WPF_ARCHITECTURE = `
# PRIME ERP: NATIVE ARCHITECTURE (.NET 8.0)

## 1. Patterns
- **MVVM**: Using CommunityToolkit.Mvvm for Source Generators.
- **Repository Pattern**: Abstracting EF Core for Unit Testing.
- **Unit of Work**: Ensuring Atomic Ledger Postings.

## 2. Global Exception Handling
\`\`\`csharp
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        AppDomain.CurrentDomain.UnhandledException += (s, ev) => 
            Logger.LogCritical((Exception)ev.ExceptionObject);
        base.OnStartup(e);
    }
}
\`\`\`

## 3. Financial Enforcement
All stock adjustments MUST implement the following service contract to prevent Logical Drift:
\`\`\`csharp
public async Task AdjustStockAsync(string itemId, decimal qty, string reason, string accountId)
{
    using var transaction = await _context.Database.BeginTransactionAsync();
    try {
        var item = await _inventoryRepo.GetByIdAsync(itemId);
        item.Stock += qty;
        
        await _ledgerRepo.PostManualEntryAsync(new LedgerRequest {
            DebitAcc = "1200", // Inventory
            CreditAcc = accountId,
            Amount = item.Cost * qty,
            Ref = reason
        });
        
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
    } catch {
        await transaction.RollbackAsync();
        throw;
    }
}
\`\`\`
`;
