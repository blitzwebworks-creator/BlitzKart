import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { EmptyState } from "@/components/empty-state";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ProductImageUploader } from "@/components/product-image-uploader";
import { money } from "@/lib/types";
import {
  adjustInventoryAction, createBannerAction, createCategoryAction, createCouponAction, createProductAction, deleteProductAction,
  createSourcingRecordAction, createSupplierAction, saveDeliveryZoneAction, setCustomerStatusAction,
  toggleBannerAction, toggleCategoryAction, toggleCouponAction, toggleSupplierAction, updateCouponAction,
  updateDeliveryAction, updateProductAction, updateSourcingRecordAction, updateSupportRequestAction,
} from "@/lib/actions/admin";

const statusLabels: Record<string,string> = { pending:"Pending",confirmed:"Confirmed",sourcing:"Sourcing",packed:"Packed",ready_for_pickup:"Ready for Pickup",out_for_delivery:"Out for Delivery",delivered:"Delivered",cancelled:"Cancelled" };
const input = (name: string, label: string, type = "text", required = false) => <label className="field" key={name}><span>{label}</span><input name={name} type={type} required={required}/></label>;
const validDate = (value?: string) => { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value ? null : value; };
function Header({ title, searchParams }: { title: string; searchParams: { message?: string; error?: string } }) { return <><h1 className="page-title" style={{ marginTop:0 }}>{title}</h1>{searchParams.message ? <p className="notice">{searchParams.message}</p> : null}{searchParams.error ? <p className="error">{searchParams.error}</p> : null}</>; }
function Empty({ title, body }: { title: string; body: string }) { return <EmptyState title={title} body={body}/>; }

export default async function AdminSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; offset?: string; message?: string; error?: string }> }) {
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
          <tbody>{data.map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{new Date(order.created_at).toLocaleString("en-IN")}</td>
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
    const [{ data: products, error }, { data: categories }] = await Promise.all([
          supabase.from("products").select("id,name,slug,description,specifications,sku,selling_price,original_price,is_featured,is_active,category_id,categories(name),inventory(quantity,reserved_quantity,low_stock_threshold),product_images(image_url,alt_text)").order("created_at", { ascending: false }).limit(200),
      supabase.from("categories").select("id,name").order("name"),
    ]);
    return <>
      <Header title="Products" searchParams={query}/>
      <form action={createProductAction} className="panel" style={{ marginBottom: 18 }}>
        <h2>Add a product</h2>
        <div className="form-grid">
          {input("name", "Product name", "text", true)}{input("sku", "SKU", "text", true)}
          {input("selling_price", "Selling price (₹)", "number", true)}{input("original_price", "Original price (optional)", "number")}
          <label className="field"><span>Category</span><select name="category_id"><option value="">No category</option>{categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {input("quantity", "Initial stock quantity", "number", true)}{input("low_stock_threshold", "Low-stock threshold", "number")}
          <label className="field"><span>Description</span><textarea name="description" maxLength={4000}/></label>
          <label className="field"><span>Specifications (JSON object)</span><textarea name="specifications" maxLength={5000} placeholder="{}"/></label>
          <label className="field"><span>Slug (optional)</span><input name="slug"/></label>
          <label><input type="checkbox" name="is_featured"/> Featured</label><label><input type="checkbox" name="is_active" defaultChecked/> Active</label>
        </div>
        <button className="btn">Create product</button>
      </form>
      {error ? <div className="error">Product records could not be loaded.</div> : products?.length ? <div style={{ display: "grid", gap: 12 }}>
        {products.map((p: any) => <article className="panel" key={p.id}>
          <form action={updateProductAction}>
            <input type="hidden" name="product_id" value={p.id}/>
            <div className="form-grid">
              <label className="field"><span>Product name</span><input name="name" defaultValue={p.name} required/></label>
              <label className="field"><span>SKU</span><input name="sku" defaultValue={p.sku} required/></label>
              <label className="field"><span>Selling price (₹)</span><input name="selling_price" type="number" min="0" step="0.01" defaultValue={p.selling_price} required/></label>
              <label className="field"><span>Original price (₹)</span><input name="original_price" type="number" min="0" step="0.01" defaultValue={p.original_price ?? ""}/></label>
              <label className="field"><span>Category</span><select name="category_id" defaultValue={p.category_id ?? ""}><option value="">No category</option>{categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="field"><span>Slug</span><input name="slug" defaultValue={p.slug}/></label>
              <label className="field"><span>Description</span><textarea name="description" defaultValue={p.description ?? ""} maxLength={4000}/></label>
              <label className="field"><span>Specifications (JSON object)</span><textarea name="specifications" defaultValue={JSON.stringify(p.specifications ?? {}, null, 2)} maxLength={5000}/></label>
              <label><input type="checkbox" name="is_featured" defaultChecked={p.is_featured}/> Featured</label>
              <label><input type="checkbox" name="is_active" defaultChecked={p.is_active}/> Active</label>
            </div>
            <button className="btn btn-outline btn-small">Save product</button>
          </form>
          <p className="muted">Stock: {p.inventory?.quantity ?? 0} · Reserved: {p.inventory?.reserved_quantity ?? 0} · {p.categories?.name ?? "Uncategorised"}</p>
          <div className="admin-product-gallery">{[...(p.product_images ?? [])].sort((a: any, b: any) => a.position - b.position).map((image: any, index: number) => <figure key={image.image_url} className="admin-product-image"><img src={image.image_url} alt={image.alt_text || p.name} width="88" height="88"/><figcaption>{index === 0 ? "Main image" : "Gallery " + index}</figcaption></figure>)}</div>
          <ProductImageUploader productId={p.id} imageCount={p.product_images?.length ?? 0}/>
          <p className="muted">Up to 6 images per product: 1 main image and up to 5 gallery images. Each image can be up to 5 MB.</p>
          <form action={deleteProductAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="product_id" value={p.id}/>
            <ConfirmSubmitButton message={`Delete ${p.name} permanently? Products with orders or stock history must be deactivated instead.`}>Delete product</ConfirmSubmitButton>
            <span className="muted" style={{ marginLeft: 8 }}>Products with order or inventory history stay in the catalogue as inactive.</span>
          </form>
        </article>)}
      </div> : <Empty title="No products have been added" body="Create a product above to begin building the catalogue."/>}
    </>;
  }
  if (section === "categories") {
    const { data, error } = await supabase.from("categories").select("id,name,slug,description,is_active,created_at").order("name");
    return <><Header title="Categories" searchParams={query}/><form action={createCategoryAction} className="panel form-grid" style={{ marginBottom:16 }}><h2 style={{ gridColumn:"1/-1" }}>Add a category</h2>{input("name","Name","text",true)}{input("slug","Slug (optional)")}<label className="field" style={{ gridColumn:"1/-1" }}><span>Description</span><textarea name="description" maxLength={500}/></label><button className="btn">Create category</button></form>{error ? <div className="error">Categories could not be loaded.</div> : data?.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Slug</th><th>Description</th><th>Active</th><th></th></tr></thead><tbody>{data.map((c:any)=><tr key={c.id}><td>{c.name}</td><td>{c.slug}</td><td>{c.description || "—"}</td><td>{c.is_active ? "Yes" : "No"}</td><td><form action={toggleCategoryAction}><input type="hidden" name="category_id" value={c.id}/><input type="hidden" name="is_active" value={String(c.is_active)}/><button className="btn btn-outline btn-small">{c.is_active ? "Disable" : "Enable"}</button></form></td></tr>)}</tbody></table></div> : <Empty title="No categories" body="Add categories to organise products in the storefront."/>}</>;
  }

  if (section === "inventory") {
    const [{data: rows,error},{data: movements}] = await Promise.all([
      supabase.from("inventory").select("product_id,quantity,reserved_quantity,low_stock_threshold,updated_at,products!inner(name,sku,is_active)").order("updated_at",{ascending:false}),
      supabase.from("inventory_movements").select("id,previous_quantity,new_quantity,reason,movement_type,created_at,products(name,sku)").order("created_at",{ascending:false}).limit(30),
    ]);
    const visible = (rows ?? []).filter((row:any)=>row.products?.is_active);
    return <><Header title="Inventory" searchParams={query}/>{error ? <div className="error">Inventory could not be loaded.</div> : visible.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Low-stock threshold</th><th>Adjust stock</th></tr></thead><tbody>{visible.map((r:any)=><tr key={r.product_id}><td>{r.products.name}<br/><span className="muted">{r.products.sku}</span></td><td>{r.quantity}</td><td>{r.reserved_quantity}</td><td>{Math.max(0,r.quantity-r.reserved_quantity)}</td><td>{r.low_stock_threshold}</td><td><form action={adjustInventoryAction} style={{ display:"flex",gap:5 }}><input type="hidden" name="product_id" value={r.product_id}/><input name="quantity" type="number" min={r.reserved_quantity} defaultValue={r.quantity} required style={{ width:76 }}/><input name="reason" placeholder="Reason" required style={{ width:120 }}/><button className="btn btn-small">Save</button></form></td></tr>)}</tbody></table></div> : <Empty title="No inventory records" body="Inventory is created when a product is added."/>}<section className="section"><h2>Recent stock movements</h2>{movements?.length ? <div className="table-wrap"><table><thead><tr><th>Time</th><th>Product</th><th>Change</th><th>Reason</th><th>Type</th></tr></thead><tbody>{movements.map((m:any)=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString("en-IN")}</td><td>{m.products?.name}</td><td>{m.previous_quantity} → {m.new_quantity}</td><td>{m.reason}</td><td>{m.movement_type}</td></tr>)}</tbody></table></div> : <Empty title="No stock movements" body="Movement history appears after a recorded stock adjustment or paid order."/>}</section></>;
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
            <td>{new Date(p.created_at).toLocaleDateString("en-IN")}</td><td>{p.order_count}</td><td>{p.account_status}</td>
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
    const [{data,error},{data:banners,bannersError}] = await Promise.all([
      supabase.from("delivery_zones").select("id,postal_code,city,delivery_charge,is_active,updated_at").eq("city", "New Delhi").order("postal_code"),
      supabase.from("promotional_banners").select("id,title,body,href,is_active,starts_at,ends_at").order("created_at",{ascending:false}).then((result)=>({data:result.data,bannersError:result.error})),
    ]);
    const gatewayReady = Boolean(process.env.UPI_GATEWAY_URL && process.env.UPI_GATEWAY_API_KEY && process.env.UPI_GATEWAY_API_SECRET && process.env.UPI_GATEWAY_WEBHOOK_SECRET);
    const gatewayEnvironment = process.env.UPI_GATEWAY_ENVIRONMENT || "live";
    return <><Header title="Settings" searchParams={query}/><div className="panel"><h2>Payment connection</h2><p>Status: <span className={`status ${gatewayReady?"status-paid":"status-pending"}`}>{gatewayReady?`Credentials configured · ${gatewayEnvironment}`:"Not configured"}</span></p><p className="muted">UPI Gateway API credentials and webhook secret are read only from server environment variables. Values are never shown in the browser. Add the public HTTPS redirect domain and the webhook URL <code>/api/payments/webhook</code> in the gateway merchant dashboard.</p></div><div className="panel" style={{marginTop:14}}><h2>Delivery mode</h2><p>Manual delivery mode is active. Shiprocket Quick booking is not enabled because the provided archive contains the UPI gateway only.</p><p className="muted">Admin delivery records can store actual booking references and status updates. Do not enter a reference until a carrier has issued one.</p></div><form action={saveDeliveryZoneAction} className="panel" style={{marginTop:14}}><h2>Configure delivery availability</h2><p className="muted">Only active New Delhi PIN codes added here can place orders. Verify each PIN code against your real service area. Delivery charges are read server-side before payment.</p><div className="form-grid"><label className="field"><span>New Delhi PIN code</span><input name="postal_code" required pattern="110[0-9]{3}" inputMode="numeric" maxLength={6}/></label><label className="field"><span>City</span><input value="New Delhi" readOnly/></label>{input("delivery_charge","Delivery charge (₹)","number",true)}<label><input type="checkbox" name="is_active" defaultChecked/> Active</label></div><button className="btn">Save delivery zone</button></form><section className="section"><h2>Configured New Delhi PIN codes</h2>{error ? <div className="error">Zones could not be loaded.</div> : data?.length ? <div className="table-wrap"><table><thead><tr><th>PIN code</th><th>City</th><th>Charge</th><th>Active</th><th>Updated</th></tr></thead><tbody>{data.map((z:any)=><tr key={z.id}><td>{z.postal_code}</td><td>{z.city}</td><td>{money(z.delivery_charge)}</td><td>{z.is_active?"Yes":"No"}</td><td>{new Date(z.updated_at).toLocaleString("en-IN")}</td></tr>)}</tbody></table></div> : <Empty title="No New Delhi PIN codes configured" body="Add verified PIN codes and actual delivery charges before accepting checkout."/>}</section><form action={createBannerAction} className="panel" style={{marginTop:18}}><h2>Promotional banner</h2><p className="muted">Only add promotion terms and links that are actually active for the business.</p><div className="form-grid">{input("title","Title","text",true)}{input("href","Internal link (optional)")}<label className="field" style={{gridColumn:"1/-1"}}><span>Message</span><textarea name="body" maxLength={500}/></label>{input("starts_at","Starts at (optional)","datetime-local")}{input("ends_at","Ends at (optional)","datetime-local")}<label><input type="checkbox" name="is_active" defaultChecked/> Active</label></div><button className="btn">Save promotion</button></form><section className="section"><h2>Promotions</h2>{bannersError ? <div className="error">Promotions could not be loaded.</div> : banners?.length ? <div className="table-wrap"><table><thead><tr><th>Title</th><th>Message</th><th>Link</th><th>Schedule</th><th>Active</th><th></th></tr></thead><tbody>{banners.map((b:any)=><tr key={b.id}><td>{b.title}</td><td>{b.body || "—"}</td><td>{b.href || "—"}</td><td>{b.starts_at || "Any time"} – {b.ends_at || "No end"}</td><td>{b.is_active?"Yes":"No"}</td><td><form action={toggleBannerAction}><input type="hidden" name="banner_id" value={b.id}/><input type="hidden" name="is_active" value={String(b.is_active)}/><button className="btn btn-outline btn-small">{b.is_active?"Disable":"Enable"}</button></form></td></tr>)}</tbody></table></div> : <Empty title="No promotions configured" body="Promotional messaging appears only after an operator creates an active banner."/>}</section></>;
  }

  if (section === "support") {
    const { data: requests, error } = await supabase.from("support_requests").select("id,subject,message,status,created_at,customer_id,order_id,orders(order_number)").order("created_at",{ascending:false}).limit(300);
    const { data: profiles } = requests?.length ? await supabase.from("profiles").select("id,full_name,email").in("id",requests.map((r:any)=>r.customer_id)) : { data: [] as any[] };
    const profileMap = new Map((profiles??[]).map((p:any)=>[p.id,p]));
    return <><Header title="Support requests" searchParams={query}/>{error ? <div className="error">Support requests could not be loaded.</div> : requests?.length ? <div style={{display:"grid",gap:12}}>{requests.map((r:any)=><form action={updateSupportRequestAction} className="panel" key={r.id}><input type="hidden" name="request_id" value={r.id}/><h2>{r.subject}</h2><p>{r.message}</p><p className="muted">{(profileMap.get(r.customer_id) as any)?.full_name || (profileMap.get(r.customer_id) as any)?.email} · {r.orders?.order_number || "No order linked"} · {new Date(r.created_at).toLocaleString("en-IN")}</p><select name="status" defaultValue={r.status}>{["open","in_progress","resolved"].map(s=><option key={s}>{s}</option>)}</select> <button className="btn btn-small">Update status</button></form>)}</div> : <Empty title="No support requests" body="Customer requests submitted through the support page will appear here."/>}</>;
  }
  return <><Header title="Admin section not found" searchParams={query}/><Link href="/admin">Return to overview</Link></>;
}
