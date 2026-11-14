import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/lib/admin";
import { EmptyState } from "@/components/empty-state";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ProductImageUploader } from "@/components/product-image-uploader";
import { NewProductForm } from "@/components/new-product-form";
import { AdminPincodeManager, type DeliveryPincode } from "@/components/admin-pincode-manager";
import { CategoryImageUpload, NewCategoryForm } from "@/components/category-image-manager";
import { money } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { isMissingProductDeliveryCharge, warnAboutProductFeeMigration } from "@/lib/data";
import {
  adjustInventoryAction, createBannerAction, createCouponAction, deleteProductAction, deleteCustomerAccountAction,
  createSourcingRecordAction, createSupplierAction, setCustomerStatusAction,
  toggleBannerAction, toggleCategoryAction, toggleSupplierAction, updateCouponAction,
  updateCustomerRequestAction, updateDeliveryAction, updateProductAction, updateSourcingRecordAction, updateSupportRequestAction,
} from "@/lib/actions/admin";

const statusLabels: Record<string,string> = { pending:"Pending",confirmed:"Confirmed",sourcing:"Sourcing",packed:"Packed",ready_for_pickup:"Ready for Pickup",out_for_delivery:"Out for Delivery",delivered:"Delivered",cancelled:"Cancelled" };
const input = (name: string, label: string, type = "text", required = false) => <label className="field" key={name}><span>{label}</span><input name={name} type={type} required={required}/></label>;
const validDate = (value?: string) => { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value ? null : value; };
function Header({ title, searchParams }: { title: string; searchParams: { message?: string; error?: string } }) { return <><h1 className="page-title" style={{ marginTop:0 }}>{title}</h1>{searchParams.message ? <p className="notice">{searchParams.message}</p> : null}{searchParams.error ? <p className="error">{searchParams.error}</p> : null}</>; }
function Empty({ title, body }: { title: string; body: string }) { return <EmptyState title={title} body={body}/>; }

export default async function AdminSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ q?: string; status?: string; category?: string; edit?: string; from?: string; to?: string; offset?: string; message?: string; error?: string }> }) {
  const { section } = await params; const query = await searchParams; const { supabase } = await requireAdmin();

  if (section === "orders") {
    const pageSize = 200;
    const pageOffset = Math.max(0, Math.floor(Number(query.offset) || 0));
    let request = supabase.from("orders").select("id,order_number,status,payment_status,total,created_at,customer_id", { count: "exact" })
      .eq("payment_environment", "live").order("created_at", { ascending: false }).range(pageOffset, pageOffset + pageSize - 1);
    if (query.q) request = request.ilike("order_number", `%${query.q.trim().replace(/[%_]/g, "\\$&")}%`);
    if (query.status && Object.keys(statusLabels).includes(query.status)) request = request.eq("status", query.status);
    const from = validDate(query.from); const to = validDate(query.to);
    if (from) request = request.gte("created_at", `${from}T00:00:00+05:30`);
    if (to) request = request.lte("created_at", `${to}T23:59:59.999+05:30`);
    const { data, error, count } = await request;
    const pageHref = (offset: number) => {
      const params = new URLSearchParams();
      if (query.q) params.set("q", query.q);
      if (query.status) params.set("status", query.status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("offset", String(offset));
      return `/admin/orders?${params.toString()}`;
    };
    return <>
      <Header title="Orders" searchParams={query}/>
      <form className="panel form-grid" method="get" style={{ marginBottom: 14 }}>
        <label className="field"><span>Search order number</span><input name="q" defaultValue={query.q}/></label>
        <label className="field"><span>Order status</span><select name="status" defaultValue={query.status}><option value="">All statuses</option>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field"><span>From date</span><input name="from" type="date" defaultValue={from ?? ""}/></label>
        <label className="field"><span>To date</span><input name="to" type="date" defaultValue={to ?? ""}/></label>
        <button className="btn btn-outline" style={{ alignSelf: "end", marginBottom: 14 }}>Filter orders</button>
      </form>
      {error ? <div className="error">Orders could not be loaded.</div> : data?.length ? <>
        <div className="table-wrap"><table><thead><tr><th>Order</th><th>Placed</th><th>Order status</th><th>Payment</th><th>Total</th><th></th></tr></thead>
          <tbody>{data.map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{formatDateTime(order.created_at)}</td>
            <td><span className="status">{order.status.replaceAll("_", " ")}</span></td><td><span className={`status status-${order.payment_status}`}>{order.payment_status.replaceAll("_", " ")}</span></td>
            <td>{money(order.total)}</td><td><Link href={`/admin/orders/${order.id}`}>Open details</Link></td></tr>)}</tbody>
        </table></div>
        <nav aria-label="Order pages" style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          {pageOffset > 0 ? <Link className="btn btn-outline btn-small" href={pageHref(Math.max(0, pageOffset - pageSize))}>Previous</Link> : <span/>}
          <span className="muted">Showing {pageOffset + 1}–{pageOffset + data.length} of {count ?? data.length}</span>
          {count !== null && pageOffset + pageSize < count ? <Link className="btn btn-outline btn-small" href={pageHref(pageOffset + pageSize)}>Next</Link> : <span/>}
        </nav>
      </> : <Empty title="No matching orders" body="Real customer orders will appear here."/>}
    </>;
  }
  if (section === "products") {
    type AdminProductRow = {
      id: string; name: string; slug: string; description: string | null; specifications: unknown;
      sku: string; selling_price: number; original_price: number | null; product_delivery_charge?: number | null;
      is_featured: boolean; is_active: boolean; category_id: string | null;
      categories: { name: string } | null;
      inventory: { quantity: number; reserved_quantity: number; low_stock_threshold: number } | null;
      product_images: { image_url: string; alt_text: string | null; position: number }[];
    };
    type ProductQueryResult = { data: AdminProductRow[] | null; error: { message: string } | null; count: number | null };
    const productColumns = "id,name,slug,description,specifications,sku,selling_price,original_price,product_delivery_charge,is_featured,is_active,category_id,categories(name),inventory(quantity,reserved_quantity,low_stock_threshold),product_images(image_url,alt_text,position)";
    const pageSize = 20;
    const pageOffset = Math.max(0, Math.floor(Number(query.offset) || 0));
    const searchTerm = (query.q ?? "").trim().replace(/[,%()*]/g, " ").replace(/[\\_]/g, "\\$&").slice(0, 100);
    const categoryId = /^[0-9a-f-]{36}$/i.test(query.category ?? "") ? query.category : "";
    const status = ["active", "inactive", "out_of_stock"].includes(query.status ?? "") ? query.status : "";
    const loadProducts = (selection: string, matchingCategoryIds: string[]) => {
      let request = supabase.from("products").select(selection, { count: "exact" }).order("created_at", { ascending: false }).range(pageOffset, pageOffset + pageSize - 1);
      if (searchTerm) {
        const searchTerms = [`name.ilike.%${searchTerm}%`, `sku.ilike.%${searchTerm}%`];
        if (matchingCategoryIds.length) searchTerms.push(`category_id.in.(${matchingCategoryIds.join(",")})`);
        request = request.or(searchTerms.join(","));
      }
      if (categoryId) request = request.eq("category_id", categoryId);
      if (status === "active") request = request.eq("is_active", true);
      if (status === "inactive") request = request.eq("is_active", false);
      if (status === "out_of_stock") request = request.eq("is_active", true).eq("inventory.quantity", 0);
      return request;
    };
    const categoryRequest = supabase.from("categories").select("id,name").order("name");
    const summaryRequests = Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", false),
      supabase.from("inventory").select("product_id,products!inner(is_active)", { count: "exact", head: true }).eq("quantity", 0).eq("products.is_active", true),
    ]);
    const matchingCategoryResult = searchTerm
      ? await supabase.from("categories").select("id").ilike("name", `%${searchTerm}%`)
      : { data: [] as { id: string }[], error: null };
    const matchingCategoryIds = (matchingCategoryResult.data ?? []).map((category) => category.id);
    let productSelection = status === "out_of_stock" ? productColumns.replace("inventory(", "inventory!inner(") : productColumns;
    let productResult = await loadProducts(productSelection, matchingCategoryIds) as unknown as ProductQueryResult;
    let productFeeSchemaMissing = false;
    if (isMissingProductDeliveryCharge(productResult.error)) {
      productFeeSchemaMissing = true;
      warnAboutProductFeeMigration();
      productSelection = productSelection.replace("product_delivery_charge,", "");
      productResult = await loadProducts(productSelection, matchingCategoryIds) as unknown as ProductQueryResult;
    }
    const [{ data: products, error, count }, { data: categories }, summary] = await Promise.all([productResult, categoryRequest, summaryRequests]);
    const [totalProducts, activeProducts, hiddenProducts, outOfStockProducts] = summary;
    const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));
    const currentPage = Math.min(Math.floor(pageOffset / pageSize) + 1, pageCount);
    const pageHref = (offset: number, next: { status?: string; edit?: string } = {}) => {
      const params = new URLSearchParams();
      if (query.q) params.set("q", query.q);
      if (categoryId) params.set("category", categoryId);
      const nextStatus = next.status ?? status;
      if (nextStatus) params.set("status", nextStatus);
      if (offset > 0) params.set("offset", String(offset));
      if (next.edit) params.set("edit", next.edit);
      const suffix = params.toString();
      return `/admin/products${suffix ? `?${suffix}` : ""}`;
    };
    const editedProduct = products?.find((product: any) => product.id === query.edit);
    const productRows = (products ?? []).map((product: any) => {
      const photo = [...(product.product_images ?? [])].sort((a: any, b: any) => a.position - b.position)[0];
      const stock = Number(product.inventory?.quantity ?? 0);
      const reserved = Number(product.inventory?.reserved_quantity ?? 0);
      const label = !product.is_active ? "Hidden" : stock === 0 ? "Out of stock" : "Active";
      const params = new URLSearchParams();
      if (query.q) params.set("q", query.q);
      if (categoryId) params.set("category", categoryId);
      if (status) params.set("status", status);
      if (pageOffset) params.set("offset", String(pageOffset));
      params.set("edit", product.id);
      return (
        <tr key={product.id}>
          <td><div className="admin-product-name-cell">{photo ? <Image src={photo.image_url} alt={photo.alt_text || ""} width={44} height={44} sizes="44px"/> : <span className="admin-product-no-photo" aria-hidden="true">{product.name.slice(0, 1).toUpperCase()}</span>}<span><strong>{product.name}</strong><small>{product.description || "Product description not added"}</small></span></div></td>
          <td className="admin-product-sku">{product.sku}</td>
          <td>{product.categories?.name ?? "—"}</td>
          <td><strong>{money(product.selling_price)}</strong>{product.original_price && product.original_price > product.selling_price ? <small className="admin-product-original-price">{money(product.original_price)}</small> : null}</td>
          <td><span className={`admin-product-stock${label === "Out of stock" ? " is-empty" : ""}`}>{stock}</span>{reserved ? <small className="admin-product-reserved">{reserved} reserved</small> : null}</td>
          <td><span className={`admin-product-status is-${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</span></td>
          <td><Link className="btn btn-outline btn-small" href={`/admin/products?${params.toString()}`}>Edit</Link></td>
        </tr>
      );
    });
    return <>
      <Header title="Products" searchParams={query}/>
      {productFeeSchemaMissing ? <p className="notice">Product-specific delivery charges are unavailable until database migration 0006 is applied.</p> : null}
      <div className="admin-product-heading"><div><span className="section-kicker">CATALOGUE</span><h2>Products</h2><p>Manage product details, pricing and stock.</p></div><details className="admin-add-product"><summary><span aria-hidden="true">＋</span> Add product</summary><div className="admin-add-product-panel"><NewProductForm categories={categories ?? []} productFeesEnabled={!productFeeSchemaMissing}/></div></details></div>
      <section className="admin-product-metrics" aria-label="Product summary">
        {[{ label: "Total products", result: totalProducts }, { label: "Active products", result: activeProducts }, { label: "Out of stock", result: outOfStockProducts }, { label: "Hidden products", result: hiddenProducts }].map(({ label, result }) => <article className="admin-product-metric" key={label}><span>{label}</span><strong>{result.error ? "—" : result.count ?? 0}</strong></article>)}
      </section>
      <nav className="admin-product-status-tabs" aria-label="Product status filters">
        {[{ key: "", label: "All products", result: totalProducts }, { key: "active", label: "Active", result: activeProducts }, { key: "out_of_stock", label: "Out of stock", result: outOfStockProducts }, { key: "inactive", label: "Hidden", result: hiddenProducts }].map(({ key, label, result }) => <Link className={`admin-product-status-tab${status === key ? " is-selected" : ""}`} href={pageHref(0, { status: key })} key={key || "all"}>{label} <span>{result.error ? "—" : result.count ?? 0}</span></Link>)}
      </nav>
      <form className="admin-product-filters" method="get">
        <label className="admin-product-search"><span className="sr-only">Search by product name or SKU</span><input name="q" type="search" defaultValue={query.q} placeholder="Search by product name or SKU…"/></label>
        <label><span className="sr-only">Filter by category</span><select name="category" defaultValue={categoryId}><option value="">All categories</option>{categories?.map((category: any) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label><span className="sr-only">Filter by status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="active">Active</option><option value="out_of_stock">Out of stock</option><option value="inactive">Hidden</option></select></label>
        <button className="btn btn-outline" type="submit">Filter products</button>
        {query.q || categoryId || status ? <Link className="admin-product-clear" href="/admin/products">Clear</Link> : null}
      </form>
      {editedProduct ? <section className="panel admin-product-editor" id="edit-product"><div className="admin-product-editor-heading"><div><span className="section-kicker">EDIT LISTING</span><h2>{editedProduct.name}</h2></div><Link className="btn btn-outline btn-small" href={pageHref(pageOffset)}>Close</Link></div>
        <form action={updateProductAction} className="admin-product-edit-form"><input type="hidden" name="product_id" value={editedProduct.id}/><div className="form-grid">
          <label className="field"><span>Product name</span><input name="name" defaultValue={editedProduct.name} required maxLength={160}/></label>
          <label className="field"><span>Selling price (₹)</span><input name="selling_price" type="number" min="0" step="0.01" defaultValue={editedProduct.selling_price} required/></label>
          <label className="field"><span>Original price <small>Optional</small></span><input name="original_price" type="number" min="0" step="0.01" defaultValue={editedProduct.original_price ?? ""}/></label>
          {productFeeSchemaMissing ? null : <label className="field"><span>Product delivery charge (₹) <small>Optional · per item</small></span><input name="product_delivery_charge" type="number" min="0" step="0.01" defaultValue={editedProduct.product_delivery_charge ?? ""} placeholder="No extra charge"/></label>}
          <label className="field"><span>Category</span><select name="category_id" defaultValue={editedProduct.category_id ?? ""}><option value="">No category</option>{categories?.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>Slug</span><input name="slug" defaultValue={editedProduct.slug} maxLength={100}/></label>
          <label className="field admin-product-edit-wide"><span>Description</span><textarea name="description" defaultValue={editedProduct.description ?? ""} maxLength={4000}/></label>
          <label className="field admin-product-edit-wide"><span>Specifications (JSON object)</span><textarea name="specifications" defaultValue={JSON.stringify(editedProduct.specifications ?? {}, null, 2)} maxLength={5000} rows={3}/></label>
          <label className="new-product-check"><input type="checkbox" name="is_featured" defaultChecked={editedProduct.is_featured}/> Featured on the home page</label>
          <label className="new-product-check"><input type="checkbox" name="is_active" defaultChecked={editedProduct.is_active}/> Active in the catalogue</label>
        </div><button className="btn" type="submit">Save changes</button></form>
        <div className="admin-product-gallery">{[...(editedProduct.product_images ?? [])].sort((a: any, b: any) => a.position - b.position).map((image: any, index: number) => <figure key={image.image_url} className="admin-product-image"><Image src={image.image_url} alt={image.alt_text || editedProduct.name} width={88} height={88} sizes="88px"/><figcaption>{index === 0 ? "Main image" : `Gallery ${index}`}</figcaption></figure>)}</div>
        <ProductImageUploader productId={editedProduct.id} imageCount={editedProduct.product_images?.length ?? 0}/><p className="muted">Up to 6 images: one main photo and up to five gallery photos.</p>
        <form action={deleteProductAction} className="admin-product-delete-form"><input type="hidden" name="product_id" value={editedProduct.id}/><ConfirmSubmitButton message={`Delete ${editedProduct.name} if it has no order or stock history? Products with history will be deactivated.`}>Delete or deactivate</ConfirmSubmitButton><span className="muted">Products with order or stock history are automatically deactivated to preserve records.</span></form>
      </section> : query.edit ? <p className="notice">Open a product on this page to edit it. Change or clear the current filters if it is not listed.</p> : null}
      {error ? <div className="error">Product records could not be loaded.</div> : productRows.length ? <div className="admin-product-table-wrap"><table className="admin-product-table"><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>{productRows}</tbody></table></div> : <Empty title={query.q || categoryId || status ? "No matching products" : "No products have been added"} body={query.q || categoryId || status ? "Try changing the search or filters." : "The catalogue is empty. Add a product when its real inventory details are ready."}/>}
      {!error && (count ?? 0) > 0 ? <nav className="admin-product-pagination" aria-label="Product pages"><span>Showing {pageOffset + 1}–{Math.min(pageOffset + (products?.length ?? 0), count ?? 0)} of {count} products</span><div>{pageOffset > 0 ? <Link className="btn btn-outline btn-small" href={pageHref(Math.max(0, pageOffset - pageSize))} aria-label="Previous page">‹ Previous</Link> : <span/>}<span>Page {currentPage} of {pageCount}</span>{pageOffset + pageSize < (count ?? 0) ? <Link className="btn btn-outline btn-small" href={pageHref(pageOffset + pageSize)} aria-label="Next page">Next ›</Link> : <span/>}</div></nav> : null}
    </>;
  }
  if (section === "categories") {
    const { data, error } = await supabase.from("categories").select("id,name,slug,description,image_url,is_active,created_at").order("name");
    return <><Header title="Categories" searchParams={query}/><NewCategoryForm/>{error ? <div className="error">Categories could not be loaded.</div> : data?.length ? <div className="category-admin-grid">{data.map((category:any)=><article className="panel category-admin-card" key={category.id}><div className="category-admin-card-heading"><div><h2>{category.name}</h2><span className="muted">/{category.slug} · {category.is_active ? "Active" : "Hidden"}</span></div><form action={toggleCategoryAction}><input type="hidden" name="category_id" value={category.id}/><input type="hidden" name="is_active" value={String(category.is_active)}/><button className="btn btn-outline btn-small">{category.is_active ? "Hide" : "Show"}</button></form></div>{category.description ? <p>{category.description}</p> : null}<CategoryImageUpload categoryId={category.id} imageUrl={category.image_url}/></article>)}</div> : <Empty title="No categories" body="Add categories to organise products in the storefront."/>}</>;
  }

  if (section === "inventory") {
    const [{data: rows,error},{data: movements}] = await Promise.all([
      supabase.from("inventory").select("product_id,quantity,reserved_quantity,low_stock_threshold,updated_at,products!inner(name,sku,is_active)").order("updated_at",{ascending:false}),
      supabase.from("inventory_movements").select("id,previous_quantity,new_quantity,reason,movement_type,created_at,products(name,sku)").order("created_at",{ascending:false}).limit(30),
    ]);
    const visible = (rows ?? []).filter((row:any)=>row.products?.is_active);
    return <><Header title="Inventory" searchParams={query}/>{error ? <div className="error">Inventory could not be loaded.</div> : visible.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Low-stock threshold</th><th>Adjust stock</th></tr></thead><tbody>{visible.map((r:any)=><tr key={r.product_id}><td>{r.products.name}<br/><span className="muted">{r.products.sku}</span></td><td>{r.quantity}</td><td>{r.reserved_quantity}</td><td>{Math.max(0,r.quantity-r.reserved_quantity)}</td><td>{r.low_stock_threshold}</td><td><form action={adjustInventoryAction} style={{ display:"flex",gap:5 }}><input type="hidden" name="product_id" value={r.product_id}/><input name="quantity" type="number" min={r.reserved_quantity} defaultValue={r.quantity} required style={{ width:76 }}/><input name="reason" placeholder="Reason" required style={{ width:120 }}/><button className="btn btn-small">Save</button></form></td></tr>)}</tbody></table></div> : <Empty title="No inventory records" body="Inventory is created when a product is added."/>}<section className="section"><h2>Recent stock movements</h2>{movements?.length ? <div className="table-wrap"><table><thead><tr><th>Time</th><th>Product</th><th>Change</th><th>Reason</th><th>Type</th></tr></thead><tbody>{movements.map((m:any)=><tr key={m.id}><td>{formatDateTime(m.created_at)}</td><td>{m.products?.name}</td><td>{m.previous_quantity} → {m.new_quantity}</td><td>{m.reason}</td><td>{m.movement_type}</td></tr>)}</tbody></table></div> : <Empty title="No stock movements" body="Movement history appears after a recorded stock adjustment or paid order."/>}</section></>;
  }

  if (section === "customers") {
    const pageSize = 100;
    const pageOffset = Math.max(0, Math.floor(Number(query.offset) || 0));
    const [{ data: profiles, error }, { data: metricsRows, error: metricsError }] = await Promise.all([
      supabase.rpc("admin_list_customers", { p_limit: pageSize, p_offset: pageOffset }),
      supabase.rpc("admin_dashboard_metrics"),
    ]);
    const total = metricsRows?.[0]?.registered_customers;
    const pageHref = (offset: number) => `/admin/customers?offset=${offset}`;
    return <>
      <Header title="Customers" searchParams={query}/>
      {error ? <div className="error">Customer records could not be loaded.</div> : profiles?.length ? <>
        <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Registered</th><th>Live orders</th><th>Status</th><th>Account</th><th></th></tr></thead>
          <tbody>{profiles.map((p: any) => <tr key={p.id}><td>{p.full_name || "—"}</td><td>{p.email}</td><td>{p.phone || "—"}</td>
            <td>{formatDate(p.created_at)}</td><td>{p.order_count}</td><td>{p.account_status}</td>
            <td><Link href={`/admin/customers/${p.id}`}>Order history</Link></td><td><form action={setCustomerStatusAction}>
              <input type="hidden" name="customer_id" value={p.id}/><input type="hidden" name="status" value={p.account_status === "active" ? "disabled" : "active"}/>
              <button className="btn btn-outline btn-small">{p.account_status === "active" ? "Disable" : "Enable"}</button>
            </form></td></tr>)}</tbody>
        </table></div>
        <nav aria-label="Customer pages" style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          {pageOffset > 0 ? <Link className="btn btn-outline btn-small" href={pageHref(Math.max(0, pageOffset - pageSize))}>Previous</Link> : <span/>}
          <span className="muted">{metricsError ? `Showing ${pageOffset + 1}–${pageOffset + profiles.length}` : `Showing ${pageOffset + 1}–${pageOffset + profiles.length} of ${Number(total ?? 0)}`}</span>
          {!metricsError && total !== undefined ? pageOffset + pageSize < Number(total) ? <Link className="btn btn-outline btn-small" href={pageHref(pageOffset + pageSize)}>Next</Link> : <span/> : profiles.length === pageSize ? <Link className="btn btn-outline btn-small" href={pageHref(pageOffset + pageSize)}>Next</Link> : <span/>}
        </nav>
      </> : error ? null : <Empty title="No registered customers" body="Customer records appear after people register."/>}
    </>;
  }
  if (section === "coupons") {
    const { data, error } = await supabase.from("coupons").select("id,code,discount_type,discount_value,minimum_order_value,usage_limit,usage_count,expires_at,is_active").order("created_at",{ascending:false});
    return <><Header title="Coupons" searchParams={query}/><form action={createCouponAction} className="panel" style={{ marginBottom:16 }}><h2>Create coupon</h2><div className="form-grid">{input("code","Coupon code","text",true)}<label className="field"><span>Discount type</span><select name="discount_type"><option value="percentage">Percentage</option><option value="fixed">Fixed amount (₹)</option></select></label>{input("discount_value","Discount value","number",true)}{input("minimum_order_value","Minimum order value (₹)","number")}{input("usage_limit","Usage limit (optional)","number")}{input("expires_at","Expiry date (optional)","datetime-local")}</div><button className="btn">Create coupon</button></form>{error ? <div className="error">Coupons could not be loaded.</div> : data?.length ? <div style={{display:"grid",gap:12}}>{data.map((c:any)=><form action={updateCouponAction} className="panel" key={c.id}><input type="hidden" name="coupon_id" value={c.id}/><div className="form-grid"><label className="field"><span>Code</span><input name="code" defaultValue={c.code}/></label><label className="field"><span>Type</span><select name="discount_type" defaultValue={c.discount_type}><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select></label><label className="field"><span>Value</span><input name="discount_value" type="number" step="0.01" defaultValue={c.discount_value}/></label><label className="field"><span>Minimum order</span><input name="minimum_order_value" type="number" step="0.01" defaultValue={c.minimum_order_value}/></label><label className="field"><span>Usage limit</span><input name="usage_limit" type="number" defaultValue={c.usage_limit ?? ""}/></label><label className="field"><span>Expiry</span><input name="expires_at" type="datetime-local" defaultValue={c.expires_at ? new Date(c.expires_at).toISOString().slice(0,16) : ""}/></label><label><input name="is_active" type="checkbox" defaultChecked={c.is_active}/> Active</label><span className="muted">Used {c.usage_count}{c.usage_limit ? ` of ${c.usage_limit}` : " times"}</span></div><button className="btn btn-outline btn-small">Save coupon</button></form>)}</div> : <Empty title="No coupons" body="Create a coupon to enable server-validated checkout discounts."/>}</>;
  }

  if (section === "deliveries") {
    const { data, error } = await supabase.from("deliveries").select("id,order_id,mode,status,tracking_reference,provider_reference,notes,updated_at,orders!inner(order_number,payment_status,payment_environment)").eq("orders.payment_environment","live").order("updated_at",{ascending:false}).limit(200);
    const states = ["pending","booked","picked_up","in_transit","out_for_delivery","delivered","exception","cancelled"];
    return <><Header title="Deliveries" searchParams={query}/><p className="notice">Manual delivery mode is active. Add only a tracking reference received from the actual carrier; Shiprocket Quick is not connected until credentials and a booking adapter are configured.</p>{error ? <div className="error">Delivery records could not be loaded.</div> : data?.length ? <div style={{display:"grid",gap:12}}>{data.map((d:any)=><form action={updateDeliveryAction} className="panel" key={d.id}><input type="hidden" name="order_id" value={d.order_id}/><h2><Link href={`/admin/orders/${d.order_id}`}>{d.orders?.order_number}</Link> <span className={`status status-${d.status}`}>{d.status.replaceAll("_"," ")}</span></h2><p className="muted">Payment: {d.orders?.payment_status}</p><div className="form-grid"><label className="field"><span>Delivery status</span><select name="status" defaultValue={d.status}>{states.map(s=><option value={s} key={s}>{s.replaceAll("_"," ")}</option>)}</select></label><label className="field"><span>Delivery mode</span><select name="mode" defaultValue="manual"><option value="manual">Manual</option></select></label><label className="field"><span>Tracking reference</span><input name="tracking_reference" defaultValue={d.tracking_reference ?? ""}/></label><label className="field"><span>Customer delivery update</span><input name="notes" defaultValue={d.notes ?? ""}/></label></div><button className="btn btn-small">Save delivery update</button></form>)}</div> : <Empty title="No delivery records" body="A delivery record is created after a payment is confirmed."/>}</>;
  }

  if (section === "pincodes") {
    const [{ data: pincodes, error }, { data: groupedOrders, error: orderError }] = await Promise.all([
      supabase.from("delivery_zones").select("id,postal_code,locality,district,state,locality_aliases,delivery_charge,minimum_order_amount,estimated_delivery_minutes,is_active,is_directory_verified").eq("is_directory_verified", true).order("postal_code"),
      supabase.rpc("admin_orders_by_delivery_pincode"),
    ]);
    const groups = (groupedOrders ?? []) as { postal_code: string; order_count: number; recent_orders: { id: string; order_number: string; status: string }[] }[];
    const pincodeRows = (pincodes ?? []) as DeliveryPincode[];
    return <><Header title="Delhi PIN code management" searchParams={query}/><p className="muted">The supplied Delhi postal directory contains 76 assigned PIN codes from 110001–110077. PIN 110050 is unassigned and is not included. All codes begin disabled; enabling a code makes it available to checkout.</p>
      {error ? <div className="error">PIN directory could not be loaded. Apply migration 0008_delhi_pincode_directory.sql, then refresh.</div> : <AdminPincodeManager pincodes={pincodeRows}/>}
      <section className="section"><div className="product-management-section-heading"><span className="section-kicker">REAL LIVE ORDERS</span><h2>Orders grouped by PIN code</h2><p>Counts cover saved live orders for verified Delhi PINs; sandbox and missing-address records are excluded.</p></div>{orderError ? <div className="error">Order counts by PIN code could not be loaded. Apply migration 0008 and refresh.</div> : groups.length ? <div className="table-wrap"><table><thead><tr><th>PIN code</th><th>Orders</th><th>Recent orders</th></tr></thead><tbody>{groups.map((group)=><tr key={group.postal_code}><td><strong>{group.postal_code}</strong></td><td>{group.order_count}</td><td>{group.recent_orders.map((order)=><span key={order.id} className="pincode-order-reference"><Link href={`/admin/orders/${order.id}`}>{order.order_number}</Link> · {statusLabels[order.status] || order.status}</span>)}</td></tr>)}</tbody></table></div> : <Empty title="No live orders by PIN code yet" body="Groups will appear after real customer orders are placed."/>}</section>
    </>;
  }

  if (section === "suppliers") {
    const { data, error } = await supabase.from("suppliers").select("id,name,reference,phone,email,notes,is_active,created_at").order("created_at",{ascending:false});
    return <><Header title="Suppliers" searchParams={query}/><form action={createSupplierAction} className="panel" style={{marginBottom:16}}><h2>Record a supplier</h2><div className="form-grid">{input("name","Supplier name","text",true)}{input("reference","Supplier reference")}{input("phone","Phone")}{input("email","Email","email")}<label className="field" style={{gridColumn:"1/-1"}}><span>Notes</span><textarea name="notes" maxLength={2000}/></label></div><button className="btn">Save supplier</button></form>{error ? <div className="error">Supplier records could not be loaded.</div> : data?.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Reference</th><th>Phone</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>{data.map((s:any)=><tr key={s.id}><td>{s.name}</td><td>{s.reference || "—"}</td><td>{s.phone || "—"}</td><td>{s.email || "—"}</td><td>{s.is_active ? "Active" : "Inactive"}</td><td><form action={toggleSupplierAction}><input type="hidden" name="supplier_id" value={s.id}/><input type="hidden" name="is_active" value={String(s.is_active)}/><button className="btn btn-outline btn-small">{s.is_active ? "Disable" : "Enable"}</button></form></td></tr>)}</tbody></table></div> : <Empty title="No supplier records" body="Record suppliers as they are onboarded."/>}</>;
  }

  if (section === "sourcing") {
    const [{data: records,error},{data:suppliers},{data:products},{data:orders}] = await Promise.all([
      supabase.from("sourcing_records").select("id,product_name,quantity,purchase_cost,purchase_date,status,notes,created_at,suppliers(name),orders(order_number)").order("created_at",{ascending:false}).limit(200),
      supabase.from("suppliers").select("id,name").eq("is_active",true).order("name"),supabase.from("products").select("id,name,sku").eq("is_active",true).order("name"),supabase.from("orders").select("id,order_number").order("created_at",{ascending:false}).limit(100),
    ]);
    return <><Header title="Sourcing" searchParams={query}/><p className="muted">Record supplier purchases and connect them to an order when applicable.</p><form action={createSourcingRecordAction} className="panel" style={{marginBottom:16}}><h2>New sourcing record</h2><div className="form-grid"><label className="field"><span>Supplier</span><select name="supplier_id"><option value="">Not selected</option>{suppliers?.map((s:any)=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label className="field"><span>Customer order</span><select name="order_id"><option value="">Not linked</option>{orders?.map((o:any)=><option value={o.id} key={o.id}>{o.order_number}</option>)}</select></label><label className="field"><span>Product (optional)</span><select name="product_id"><option value="">Other / unlisted</option>{products?.map((p:any)=><option value={p.id} key={p.id}>{p.name} · {p.sku}</option>)}</select></label>{input("product_name","Purchased product name","text",true)}{input("quantity","Quantity","number",true)}{input("purchase_cost","Purchase cost total (₹)","number",true)}{input("purchase_date","Purchase date","date")}<label className="field"><span>Status</span><select name="status"><option value="pending">Pending</option><option value="ordered">Ordered</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select></label><label className="field" style={{gridColumn:"1/-1"}}><span>Notes</span><textarea name="notes" maxLength={2000}/></label></div><button className="btn">Save sourcing record</button></form>{error ? <div className="error">Sourcing records could not be loaded.</div> : records?.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Supplier</th><th>Order</th><th>Qty</th><th>Purchase cost</th><th>Purchase date</th><th>Status</th></tr></thead><tbody>{records.map((r:any)=><tr key={r.id}><td>{r.product_name}</td><td>{r.suppliers?.name || "—"}</td><td>{r.orders?.order_number || "—"}</td><td>{r.quantity}</td><td>{money(r.purchase_cost)}</td><td>{r.purchase_date || "—"}</td><td><form action={updateSourcingRecordAction}><input type="hidden" name="record_id" value={r.id}/><select name="status" defaultValue={r.status}>{["pending","ordered","received","cancelled"].map(s=><option key={s}>{s}</option>)}</select><input name="notes" defaultValue={r.notes ?? ""} placeholder="Notes"/><button className="btn btn-small">Save</button></form></td></tr>)}</tbody></table></div> : <Empty title="No sourcing records" body="Sourcing purchases will be listed when entered."/>}</>;
  }

  if (section === "analytics") {
    const [daily, statuses, best, low] = await Promise.all([
      supabase.rpc("admin_daily_analytics", { p_days: 14 }),
      supabase.rpc("admin_order_status_breakdown"),
      supabase.rpc("admin_bestsellers", { p_limit: 10 }),
      supabase.rpc("admin_low_stock_products"),
    ]);
    return <><Header title="Analytics" searchParams={query}/><p className="muted">Order counts use actual live orders. Revenue includes only verified paid and delivered orders.</p>
      <section className="section"><h2>Orders and revenue by day · last 14 days</h2>{daily.error ? <div className="error">Daily analytics could not be loaded.</div> : daily.data?.length ? (() => { const maxOrders=Math.max(1,...daily.data.map((r:any)=>Number(r.order_count))); return <div className="table-wrap"><table><thead><tr><th>Date</th><th>Orders</th><th>Revenue · paid & delivered</th><th>Orders chart</th></tr></thead><tbody>{daily.data.map((r:any)=><tr key={r.sales_day}><td>{r.sales_day}</td><td>{r.order_count}</td><td>{money(Number(r.revenue))}</td><td><div style={{height:10,width:`${Math.max(4,Number(r.order_count)/maxOrders*100)}%`,background:"var(--green)"}}/></td></tr>)}</tbody></table></div>; })() : <Empty title="No orders in this period" body="Daily analytics appear after real orders are received."/>}</section>
      <section className="section"><h2>Order status breakdown</h2>{statuses.error ? <div className="error">Order status counts could not be loaded.</div> : statuses.data?.length ? <div className="table-wrap"><table><thead><tr><th>Status</th><th>Orders</th></tr></thead><tbody>{statuses.data.map((r:any)=><tr key={r.order_status}><td>{statusLabels[r.order_status]||r.order_status}</td><td>{r.order_count}</td></tr>)}</tbody></table></div> : <Empty title="No order status data" body="Status counts appear after real orders are received."/>}</section>
      <section className="section"><h2>Bestselling products</h2>{best.error ? <div className="error">Bestsellers could not be loaded.</div> : best.data?.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Units in paid, delivered orders</th><th>Line value</th></tr></thead><tbody>{best.data.map((r:any)=><tr key={r.product_name}><td>{r.product_name}</td><td>{r.quantity}</td><td>{money(Number(r.revenue))}</td></tr>)}</tbody></table></div> : <Empty title="No completed paid product sales" body="Bestsellers appear after paid orders are delivered."/>}</section>
      <section className="section"><h2>Low-stock overview</h2>{low.error ? <div className="error">Low-stock data could not be loaded.</div> : low.data?.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Available</th><th>Threshold</th></tr></thead><tbody>{low.data.map((r:any)=><tr key={r.product_id}><td>{r.product_name} · {r.sku}</td><td>{r.available_quantity}</td><td>{r.low_stock_threshold}</td></tr>)}</tbody></table></div> : <Empty title="No products at low stock" body="This view reflects current active product stock after reservations."/>}</section>
    </>;
  }

  if (section === "settings") {
    const {data:banners,error:bannersError} = await supabase.from("promotional_banners").select("id,title,body,href,is_active,starts_at,ends_at").order("created_at",{ascending:false});
    const razorpayReady = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
    const payuReady = Boolean(process.env.PAYU_KEY && process.env.PAYU_SALT);
    return <><Header title="Settings" searchParams={query}/><div className="panel"><h2>Payment providers</h2><p>Razorpay: <span className={`status ${razorpayReady?"status-paid":"status-pending"}`}>{razorpayReady ? (process.env.RAZORPAY_ENVIRONMENT === "test" ? "Test configured" : "Configured") : "Not configured"}</span></p><p>PayU: <span className={`status ${payuReady?"status-paid":"status-pending"}`}>{payuReady ? (process.env.PAYU_ENVIRONMENT === "test" ? "Test configured" : "Configured") : "Not configured"}</span></p><p className="muted">Credentials are read only from server environment variables and are never shown here. Razorpay webhook endpoint: <code>/api/payments/razorpay/webhook</code>. PayU server notification endpoint: <code>/api/payments/payu/webhook</code>; return endpoint: <code>/api/payments/payu/return</code>.</p></div><div className="panel" style={{marginTop:14}}><h2>Delivery operations</h2><p>Manual delivery mode is active. Carrier booking integration is not configured. Delivery booking references and statuses must come from the real carrier/operator.</p><p className="muted">Configure individual PIN serviceability, postal aliases, charges, minimum order amounts and delivery estimates in the PIN code workspace.</p><Link className="btn btn-outline" href="/admin/pincodes">Manage Delhi PIN codes</Link></div><form action={createBannerAction} className="panel" style={{marginTop:18}}><h2>Promotional banner</h2><p className="muted">Only add promotion terms and links that are actually active for the business.</p><div className="form-grid">{input("title","Title","text",true)}{input("href","Internal link (optional)")}<label className="field" style={{gridColumn:"1/-1"}}><span>Message</span><textarea name="body" maxLength={500}/></label>{input("starts_at","Starts at (optional)","datetime-local")}{input("ends_at","Ends at (optional)","datetime-local")}<label><input type="checkbox" name="is_active" defaultChecked/> Active</label></div><button className="btn">Save promotion</button></form><section className="section"><h2>Promotions</h2>{bannersError ? <div className="error">Promotions could not be loaded.</div> : banners?.length ? <div className="table-wrap"><table><thead><tr><th>Title</th><th>Message</th><th>Link</th><th>Schedule</th><th>Active</th><th></th></tr></thead><tbody>{banners.map((b:any)=><tr key={b.id}><td>{b.title}</td><td>{b.body || "—"}</td><td>{b.href || "—"}</td><td>{b.starts_at || "Any time"} – {b.ends_at || "No end"}</td><td>{b.is_active?"Yes":"No"}</td><td><form action={toggleBannerAction}><input type="hidden" name="banner_id" value={b.id}/><input type="hidden" name="is_active" value={String(b.is_active)}/><button className="btn btn-outline btn-small">{b.is_active?"Disable":"Enable"}</button></form></td></tr>)}</tbody></table></div> : <Empty title="No promotions configured" body="Promotional messaging appears only after an operator creates an active banner."/>}</section></>;
  }

  if (section === "requests") {
    const { data: requests, error } = await supabase.from("customer_requests")
      .select("id,customer_id,order_id,order_number,request_type,reason,details,customer_name,customer_email,customer_phone,status,created_at,processed_at,orders(order_number,status,payment_status)")
      .order("created_at",{ascending:false}).limit(300);
    const customerIds = [...new Set((requests ?? []).map((request:any)=>request.customer_id).filter((id:any): id is string => typeof id === "string"))];
    const { data: profiles } = customerIds.length ? await supabase.from("profiles").select("id,full_name,email,phone").in("id",customerIds) : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((profile:any)=>[profile.id,profile]));
    const requestTypeLabels: Record<string,string> = { cancel:"Cancellation",return:"Return",exchange:"Exchange",account_deletion:"Account deletion" };
    return <><Header title="Customer requests" searchParams={query}/><p className="muted">Review cancellation, return, exchange and account deletion requests. Cancellation cannot be approved after an order is out for delivery.</p>
      {error ? <div className="error">Customer requests could not be loaded. Apply Supabase migration 0007 and refresh.</div> : requests?.length ? <div className="support-admin-list">{requests.map((request:any)=>{
        const profile = profileMap.get(request.customer_id) as any;
        const name = request.customer_name || profile?.full_name || "Customer account removed";
        const email = request.customer_email || profile?.email;
        const phone = request.customer_phone || profile?.phone;
        const orderNumber = request.orders?.order_number || request.order_number;
        const accountRequest = request.request_type === "account_deletion";
        const statusOptions = accountRequest ? ["open","in_progress","approved","rejected"] : ["open","in_progress","approved","rejected","completed"];
        return <article className="panel customer-request-admin-card" key={request.id}>
          <div className="support-admin-heading"><div><span className="section-kicker">{requestTypeLabels[request.request_type] || "Customer request"}</span><h2>{orderNumber ? <Link href={request.order_id ? `/admin/orders/${request.order_id}` : "/admin/orders"}>{orderNumber}</Link> : "Account deletion"}</h2><p className="muted">Received {formatDateTime(request.created_at)}</p></div><span className={`status status-${request.status}`}>{request.status.replaceAll("_"," ")}</span></div>
          <div className="customer-request-admin-details"><div><strong>Customer</strong><span>{name}</span>{email ? <a href={`mailto:${email}`}>{email}</a> : null}{phone ? <a href={`tel:${phone}`}>{phone}</a> : null}{request.customer_id ? <Link href={`/admin/customers/${request.customer_id}`}>Open customer account</Link> : null}</div><div><strong>Request details</strong><span>Reason: {request.reason}</span>{request.details ? <p>{request.details}</p> : null}{request.orders?.status ? <span>Order status: {request.orders.status.replaceAll("_"," ")} · Payment: {request.orders.payment_status?.replaceAll("_"," ")}</span> : null}</div></div>
          <div className="customer-request-admin-actions"><form action={updateCustomerRequestAction} className="support-admin-actions"><input type="hidden" name="request_id" value={request.id}/><label className="field"><span>Request status</span><select name="status" defaultValue={request.status}>{statusOptions.map((status)=> <option value={status} key={status}>{status.replaceAll("_"," ")}</option>)}</select></label><button className="btn btn-small">Save status</button></form>
            {accountRequest && request.customer_id && request.status !== "completed" ? <form action={deleteCustomerAccountAction} className="customer-delete-action"><input type="hidden" name="request_id" value={request.id}/><ConfirmSubmitButton className="btn btn-outline" message={`Permanently remove ${name}'s BlitzKart sign-in account and personal address information? Order/payment records will remain anonymized.`}>Delete customer account</ConfirmSubmitButton></form> : null}
          </div>
        </article>;
      })}</div> : <Empty title="No customer requests yet" body="Order cancellation, returns, exchanges and account deletion requests will be listed here."/>}</>;
  }

  if (section === "support") {
    const { data: requests, error } = await supabase.from("support_requests").select("id,subject,message,status,created_at,customer_id,contact_name,contact_email,contact_phone,order_id,orders(order_number)").order("created_at",{ascending:false}).limit(300);
    const customerIds = [...new Set((requests ?? []).map((request:any)=>request.customer_id).filter((id:any): id is string => typeof id === "string"))];
    const { data: profiles } = customerIds.length ? await supabase.from("profiles").select("id,full_name,email,phone").in("id",customerIds) : { data: [] as any[] };
    const profileMap = new Map((profiles??[]).map((p:any)=>[p.id,p]));
    return <><Header title="Support requests" searchParams={query}/><p className="muted">Messages from signed-in customers and guest contact forms appear here.</p>{error ? <div className="error">Support requests could not be loaded.</div> : requests?.length ? <div className="support-admin-list">{requests.map((r:any)=>{const customer=profileMap.get(r.customer_id) as any;const name=r.contact_name || customer?.full_name || customer?.email || "Customer";const email=r.contact_email || customer?.email;const phone=r.contact_phone || customer?.phone;return <form action={updateSupportRequestAction} className="panel support-admin-card" key={r.id}><input type="hidden" name="request_id" value={r.id}/><div className="support-admin-heading"><div><h2>{r.subject}</h2><p className="muted">{name} · {formatDateTime(r.created_at)}</p></div><span className={`status status-${r.status}`}>{r.status.replaceAll("_"," ")}</span></div><p className="support-admin-message">{r.message}</p><div className="support-admin-meta">{email ? <a href={`mailto:${email}`}>{email}</a> : null}{phone ? <a href={`tel:${phone}`}>{phone}</a> : null}<span>{r.orders?.order_number || "General request"}</span></div><div className="support-admin-actions"><label className="field"><span>Request status</span><select name="status" defaultValue={r.status}>{["open","in_progress","resolved"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></label><button className="btn btn-small">Save status</button></div></form>})}</div> : <Empty title="No support requests yet" body="Customer complaints and questions will show here after a customer submits a request."/>}</>;
  }
  return <><Header title="Admin section not found" searchParams={query}/><Link href="/admin">Return to overview</Link></>;
}
