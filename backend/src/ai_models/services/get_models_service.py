class GetModelsService:
        def __init__(self,repository):
                self.repo = repository

        def execute (self):
                return self.repo.get_all()
        
                