from models.category import Category


class CategoryService:
    """分类服务"""

    @staticmethod
    def get_categories_tree():
        """获取树状分类结构"""
        return Category.get_all_tree()

    @staticmethod
    def get_categories_flat():
        """获取扁平分类结构"""
        return Category.get_all_flat()

    @staticmethod
    def create_category(name, parent_id=None):
        """创建分类"""
        # 确定级别
        level = 1
        if parent_id:
            parent = Category.get_by_id(parent_id)
            if parent:
                level = parent['level'] + 1

        return Category.create(name, parent_id, level)

    @staticmethod
    def delete_category(category_id):
        """删除分类"""
        return Category.delete(category_id)

    @staticmethod
    def reorder_siblings(parent_id, ordered_ids):
        """重排同一父级下的分类。"""
        return Category.reorder_siblings(parent_id, ordered_ids)

    @staticmethod
    def get_category_path(category_id, categories=None):
        """获取分类路径"""
        if categories is None:
            categories = Category.get_all_flat()

        category = next((cat for cat in categories if cat['id'] == category_id), None)
        if not category:
            return "未分类"

        if category['level'] == 1:
            return category['name']
        else:
            parent = next((cat for cat in categories if cat['id'] == category['parent_id']), None)
            if parent:
                return f"{parent['name']} / {category['name']}"
            else:
                return category['name']

    @staticmethod
    def get_descendant_ids(category_id):
        """返回给定分类ID及其直接子分类的 id 列表（作为字符串列表）。

        说明：当前分类模型只维护到两级（level 1 和 level 2），所以这里实现的是
        返回目标分类本身的 id 以及其直接子分类（parent_id == target_id）的 id。
        返回值均为字符串，便于构造 SQL 参数或前端比较。
        """
        try:
            categories = Category.get_all_flat()
            target_id = int(category_id)
        except Exception:
            return [str(category_id)]

        ids = [str(target_id)]
        for cat in categories:
            if cat.get('parent_id') == target_id:
                ids.append(str(cat.get('id')))

        return ids